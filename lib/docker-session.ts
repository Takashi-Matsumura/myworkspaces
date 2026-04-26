import Docker from "dockerode";
import type { Duplex } from "node:stream";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { sanitizeSub } from "./user";
import { getUserNetworkIsolation } from "./user-network";
import { getCurrentWorkspaceId, workspaceCwd } from "./user-store";
import type { ClientMessage } from "./ws-protocol";

// イメージ / コンテナ / ボリュームの命名規約。
// sub ごとに切り分けるのが myworkspaces の本体。
const IMAGE = "myworkspaces-sandbox:latest";
const DOCKERFILE_CONTEXT = "docker/sandbox";
const CONTAINER_PREFIX = "myworkspaces-shell-";
const VOLUME_PREFIX = "myworkspaces-home-";
const ROLE_LABEL_KEY = "io.myworkspaces.role";
const SUB_LABEL_KEY = "io.myworkspaces.sub";

// RAG サイドカー (Qdrant + FastAPI 同居 image)。
// myworkspaces-shell-{sub} と 1:1 で立ち上げ、per-user network 経由で
// opencode から "rag-sidecar" alias で解決される。データは named volume に永続化。
const RAG_IMAGE = "myworkspaces-rag:latest";
const RAG_DOCKERFILE_CONTEXT = "docker/rag";
const RAG_CONTAINER_PREFIX = "myworkspaces-rag-";
const RAG_VOLUME_PREFIX = "myworkspaces-rag-data-";
const RAG_NETWORK_PREFIX = "myworkspaces-user-";
// rag サイドカー内で FastAPI が LISTEN しているポート。opencode からは
// per-user network 内で rag-sidecar:9090 として到達する。同時にホスト
// (Next.js プロセス) から ingest/documents を叩くためにランダム公開する。
const RAG_INTERNAL_PORT = 9090;
const RAG_ALIAS = "rag-sidecar";

// opencode サイドカー (ヘッドレス HTTP サーバ)。
// shell コンテナと **同じ named volume `myworkspaces-home-{sub}` を共有**し、
// SQLite (WAL モード) の opencode.db を共有する。TUI と HTTP API のセッションが
// 透過的に同じ DB を見るので、どちらから始めた会話も相互に参照できる。
// Image は shell コンテナと共通 (myworkspaces-sandbox:latest、opencode 同梱)。
const OPENCODE_IMAGE = IMAGE;
const OPENCODE_CONTAINER_PREFIX = "myworkspaces-opencode-";
const OPENCODE_INTERNAL_PORT = 9091;
const OPENCODE_ALIAS = "opencode-server";
// 起動時 cwd に紐付いているワークスペース ID を Labels に残しておく。
// 切替時にコンテナを作り直す判定に使う (opencode serve は session.directory を
// プロセス cwd で固定するため、ワークスペース切替 = コンテナ再作成が必要)。
const OPENCODE_WORKSPACE_LABEL = "io.myworkspaces.opencode.workspaceId";
// Phase 1 実測で serve プロセスは RSS 約 280MB。余裕を見て 512MB で制限する。
// shell コンテナ (1GB) の余裕が TUI プロセス増で圧迫された時に巻き込まれない
// よう、独立コンテナに切り出す設計の主要メリットがこの枠分離。
const OPENCODE_MEMORY_BYTES = Number(
  process.env.OPENCODE_MEMORY_BYTES ?? 512 * 1024 * 1024,
);

// 隔離モード用 user-defined bridge。
// Internal: true にすることで、このネットワークに接続されたコンテナからは
// 外部インターネットにも、gateway 経由でのホストにも到達できなくなる。
// 一方、ホスト上の llama-server (host.docker.internal:8080) への到達は
// 「サイドカー egress-proxy コンテナ」を経由して行う。プロキシは通常 bridge にも
// 同居し、isolated ネットワーク内に固定 IP (PROXY_IP) を持つ。ユーザコンテナの
// ExtraHosts で host.docker.internal -> PROXY_IP を書いてあるので opencode 側の
// endpoint (http://host.docker.internal:8080) はそのまま動く。
export const ISOLATED_NETWORK = "myworkspaces-isolated";
const ISOLATED_SUBNET = "172.25.0.0/16";

const PROXY_CONTAINER = "myworkspaces-egress-proxy";
const PROXY_IMAGE = "alpine/socat:latest";
const PROXY_IP = "172.25.0.2";
// opencode.json のデフォルト endpoint とホストの llama-server ポート (8080) に合わせる。
// 将来 endpoint を可変にするなら、ここも設定から引く構造に直す。
// 8080: chat 用 llama-server (Gemma 4)
// 8081: embedding 用 llama-server (BGE-M3 等)。RAG サイドカーが叩く。
const PROXY_FORWARD_PORTS = [8080, 8081] as const;

// docker-compose のプロジェクトラベルを付与し、Docker Desktop 上で
// postgres と同じ "myworkspaces" グループにまとめて表示する。
// compose の管理下に入るわけではない (docker-compose.yml には書かれていない)。
const COMPOSE_PROJECT = "myworkspaces";
const COMPOSE_LABELS = {
  "com.docker.compose.project": COMPOSE_PROJECT,
  "com.docker.compose.project.config_files": "docker-compose.yml",
} as const;

// リソース上限。opencode + Node.js + llama クライアントを同居させるので
// ptyserver-demo (512MB / 1 CPU) より大きめに取る。必要に応じて環境変数で調整。
const MEM_BYTES = Number(process.env.CONTAINER_MEMORY_BYTES ?? 1024 * 1024 * 1024);
const NANO_CPUS = Number(process.env.CONTAINER_NANO_CPUS ?? 2_000_000_000);
const PID_LIMIT = Number(process.env.CONTAINER_PID_LIMIT ?? 512);

const HEARTBEAT_MS = 30_000;
// スリープ復帰やブラウザ再読込の猶予。この間に再接続が来れば同じ exec に再 attach。
const DISCONNECT_TIMEOUT_MS = 5 * 60 * 1000;
// WS 切断中のコンテナ stdout を保持するバイト数上限。超えた古い chunk から捨てる。
const OUTPUT_BUFFER_MAX = 200_000;

export type Cmd = "opencode" | "shell";

export type ContainerStatus = {
  exists: boolean;
  running: boolean;
  id?: string; // short (12 chars) Docker container ID
  networkMode?: string; // "bridge" | ISOLATED_NETWORK など
  isolated?: boolean; // networkMode === ISOLATED_NETWORK
};

export type NetworkOptions = { isolated: boolean };

const docker = new Docker();

function containerName(sub: string): string {
  return `${CONTAINER_PREFIX}${sanitizeSub(sub)}`;
}

function volumeName(sub: string): string {
  return `${VOLUME_PREFIX}${sanitizeSub(sub)}`;
}

function ragContainerName(sub: string): string {
  return `${RAG_CONTAINER_PREFIX}${sanitizeSub(sub)}`;
}

function ragVolumeName(sub: string): string {
  return `${RAG_VOLUME_PREFIX}${sanitizeSub(sub)}`;
}

function userNetworkName(sub: string): string {
  return `${RAG_NETWORK_PREFIX}${sanitizeSub(sub)}`;
}

function opencodeContainerName(sub: string): string {
  return `${OPENCODE_CONTAINER_PREFIX}${sanitizeSub(sub)}`;
}

// ─────────────────────────────────────────────
// Image / Volume / Container の ensure
// ─────────────────────────────────────────────

export async function ensureImageBuilt(): Promise<void> {
  try {
    await docker.getImage(IMAGE).inspect();
    console.log(`[docker] image ready: ${IMAGE}`);
  } catch {
    console.log(`[docker] building ${IMAGE} from ${DOCKERFILE_CONTEXT}/Dockerfile...`);
    // dockerode の src はディレクトリ名を渡しても再帰展開されないため、ファイルを個別列挙する。
    const buildStream = await docker.buildImage(
      {
        context: DOCKERFILE_CONTEXT,
        src: [
          "Dockerfile",
          "myworkspaces-prompt.sh",
          "templates/.opencode/tools/describe_image.ts",
          "templates/.opencode/tools/read_excel.ts",
          "templates/.opencode/tools/read_pdf.ts",
          "templates/.opencode/tools/web_search.ts",
          "templates/.opencode/rules/language-rules.md",
          "templates/.opencode/rules/vision-rules.md",
          "templates/.opencode/rules/business-rules.md",
          "templates/.opencode/rules/pdf-rules.md",
          "templates/.opencode/rules/coding-rules.md",
          "templates/.opencode/rules/analyze-rules.md",
          "templates/opencode.json",
        ],
      },
      { t: IMAGE, rm: true, labels: { ...COMPOSE_LABELS } },
    );
    await followBuild(buildStream);
    console.log(`[docker] built ${IMAGE}`);
  }

  await ensureRagImageBuilt();
}

async function ensureRagImageBuilt(): Promise<void> {
  try {
    await docker.getImage(RAG_IMAGE).inspect();
    console.log(`[docker] image ready: ${RAG_IMAGE}`);
    return;
  } catch {
    // fall through to build
  }
  console.log(`[docker] building ${RAG_IMAGE} from ${RAG_DOCKERFILE_CONTEXT}/Dockerfile...`);
  const buildStream = await docker.buildImage(
    {
      context: RAG_DOCKERFILE_CONTEXT,
      src: [
        "Dockerfile",
        "requirements.txt",
        "qdrant.yaml",
        "supervisord.conf",
        "app/main.py",
        "app/chunking.py",
      ],
    },
    { t: RAG_IMAGE, rm: true, labels: { ...COMPOSE_LABELS } },
  );
  await followBuild(buildStream);
  console.log(`[docker] built ${RAG_IMAGE}`);
}

async function followBuild(stream: NodeJS.ReadableStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err, res) => {
        if (err) return reject(err);
        const errorLine = (res as Array<{ error?: string }> | null)?.find((r) => r?.error);
        if (errorLine?.error) return reject(new Error(errorLine.error));
        resolve();
      },
      (event) => {
        const s = (event as { stream?: string }).stream;
        if (s) process.stdout.write(`[docker] build: ${s}`);
      },
    );
  });
}

// 隔離ネットワークを冪等に用意する。既に存在していれば何もしない。
// サーバ起動時と、隔離 ON に切り替える API ハンドラから呼ばれる想定。
export async function ensureIsolatedNetwork(): Promise<void> {
  try {
    await docker.getNetwork(ISOLATED_NETWORK).inspect();
    return;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }
  await docker.createNetwork({
    Name: ISOLATED_NETWORK,
    Driver: "bridge",
    CheckDuplicate: true,
    Internal: true,
    IPAM: {
      Config: [{ Subnet: ISOLATED_SUBNET }],
    },
    Options: {
      "com.docker.network.bridge.name": "mw-iso0",
    },
    Labels: {
      [ROLE_LABEL_KEY]: "isolated-network",
      ...COMPOSE_LABELS,
    },
  });
  console.log(`[docker] isolated network created: ${ISOLATED_NETWORK}`);
}

async function ensureProxyImage(): Promise<void> {
  try {
    await docker.getImage(PROXY_IMAGE).inspect();
    return;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }
  console.log(`[docker] pulling ${PROXY_IMAGE}...`);
  await new Promise<void>((resolve, reject) => {
    docker.pull(PROXY_IMAGE, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (e) => (e ? reject(e) : resolve()));
    });
  });
}

const PROXY_PORTS_LABEL = "io.myworkspaces.egress-proxy.ports";

// 隔離モード用 egress プロキシ。全ユーザ共有の 1 コンテナ。
// bridge (外向き ok) と isolated の両方に attach し、isolated 側の固定 IP で
// ユーザコンテナからの llama-server 行きトラフィックだけを中継する。
export async function ensureEgressProxyContainer(): Promise<void> {
  const portsLabelValue = PROXY_FORWARD_PORTS.join(",");
  const existing = docker.getContainer(PROXY_CONTAINER);
  try {
    const info = await existing.inspect();
    const storedPorts = info.Config?.Labels?.[PROXY_PORTS_LABEL];
    // 転送ポート一覧が変わっていたら作り直す (例: 8080 のみ → 8080,8081)
    if (storedPorts !== portsLabelValue) {
      console.log(
        `[docker] egress proxy ports outdated (${storedPorts} -> ${portsLabelValue}), recreating`,
      );
      await existing.remove({ force: true });
    } else {
      if (!info.State.Running) {
        await existing.start();
        console.log(`[docker] started egress proxy: ${PROXY_CONTAINER}`);
      }
      return;
    }
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }

  await ensureIsolatedNetwork();
  await ensureProxyImage();

  try {
    // alpine/socat は entrypoint が socat 固定。複数ポート中継するために
    // entrypoint を sh に差し替え、各ポート用の socat を & で並列起動して wait。
    const forwardCmd = PROXY_FORWARD_PORTS.map(
      (p) =>
        `socat TCP-LISTEN:${p},fork,reuseaddr TCP:host.docker.internal:${p} &`,
    ).join(" ");
    const created = await docker.createContainer({
      name: PROXY_CONTAINER,
      Image: PROXY_IMAGE,
      Entrypoint: ["/bin/sh", "-c"],
      Cmd: [`${forwardCmd} wait`],
      Labels: {
        [ROLE_LABEL_KEY]: "egress-proxy",
        [PROXY_PORTS_LABEL]: portsLabelValue,
        ...COMPOSE_LABELS,
        "com.docker.compose.service": "egress-proxy",
      },
      HostConfig: {
        RestartPolicy: { Name: "unless-stopped" },
        NetworkMode: "bridge",
        ExtraHosts: ["host.docker.internal:host-gateway"],
        Memory: 64 * 1024 * 1024,
        PidsLimit: 64,
      },
    });
    await docker.getNetwork(ISOLATED_NETWORK).connect({
      Container: PROXY_CONTAINER,
      EndpointConfig: {
        IPAMConfig: { IPv4Address: PROXY_IP },
      },
    });
    await created.start();
    console.log(`[docker] created egress proxy: ${PROXY_CONTAINER} (ip=${PROXY_IP})`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 409) {
      const c = docker.getContainer(PROXY_CONTAINER);
      const info = await c.inspect();
      if (!info.State.Running) await c.start();
      return;
    }
    throw err;
  }
}

export async function ensureHomeVolume(sub: string): Promise<string> {
  const name = volumeName(sub);
  try {
    await docker.getVolume(name).inspect();
    return name;
  } catch {
    // fall through to create
  }
  await docker.createVolume({
    Name: name,
    Labels: {
      [ROLE_LABEL_KEY]: "home",
      [SUB_LABEL_KEY]: sub,
      ...COMPOSE_LABELS,
      "com.docker.compose.volume": "home",
    },
  });
  console.log(`[docker] home volume created: ${name}`);
  return name;
}

// RAG 用の永続化先 (Qdrant storage + /data 配下のアップロード受け皿)。
export async function ensureRagDataVolume(sub: string): Promise<string> {
  const name = ragVolumeName(sub);
  try {
    await docker.getVolume(name).inspect();
    return name;
  } catch {
    // fall through to create
  }
  await docker.createVolume({
    Name: name,
    Labels: {
      [ROLE_LABEL_KEY]: "rag-data",
      [SUB_LABEL_KEY]: sub,
      ...COMPOSE_LABELS,
      "com.docker.compose.volume": `rag-data-${sanitizeSub(sub)}`,
    },
  });
  console.log(`[docker] rag data volume created: ${name}`);
  return name;
}

// ユーザごとの閉じた bridge ネットワーク。opencode (user container) と
// rag サイドカーの両方をここに繋ぎ、コンテナ名/alias で解決させる。
// 隔離 ON のユーザでも、RAG サイドカーとの内部通信はこの bridge に閉じる。
// (isolated 側の外向き遮断には影響しない — 別ネットワークへの attach は共存可)
export async function ensureUserNetwork(sub: string): Promise<string> {
  const name = userNetworkName(sub);
  try {
    await docker.getNetwork(name).inspect();
    return name;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }
  await docker.createNetwork({
    Name: name,
    Driver: "bridge",
    CheckDuplicate: true,
    Labels: {
      [ROLE_LABEL_KEY]: "user-network",
      [SUB_LABEL_KEY]: sub,
      ...COMPOSE_LABELS,
    },
  });
  console.log(`[docker] user network created: ${name}`);
  return name;
}

// myworkspaces が管理するコンテナの命名規則。
// ensure*Container 系で作るものはすべて "myworkspaces-" で始まる。
const MANAGED_PREFIX = "myworkspaces-";

async function removeUserNetwork(sub: string): Promise<void> {
  const name = userNetworkName(sub);
  const network = docker.getNetwork(name);

  // ネットワークに残っているエンドポイントを inspect。
  // 直前で removeContainer / removeRagSidecar / removeOpencodeSidecar が成功
  // していれば管理コンテナはすでに居ないが、レースで残っている場合や、
  // ユーザが手動接続した未管理コンテナ (例: ws-nextjs-proxy) があると
  // network.remove() が 403 "has active endpoints" で失敗する。
  // そのため、managed prefix のものは force disconnect で剥がし、
  // 未管理コンテナが残っているなら削除を skip して warning ログにする
  // (ネットワークは ensureUserNetwork で次回も再利用される)。
  let info: Docker.NetworkInspectInfo;
  try {
    info = await network.inspect();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return; // 既に存在しない
    throw err;
  }

  const containers = (info.Containers ?? {}) as Record<string, { Name?: string }>;
  const endpointNames = Object.values(containers)
    .map((c) => c.Name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);

  const managed: string[] = [];
  const external: string[] = [];
  for (const epName of endpointNames) {
    if (epName.startsWith(MANAGED_PREFIX)) managed.push(epName);
    else external.push(epName);
  }

  // 管理コンテナ (本来 remove で剥がれているはずだが念のため) を切り離す。
  for (const ep of managed) {
    try {
      await network.disconnect({ Container: ep, Force: true });
      console.log(`[docker] disconnected ${ep} from ${name}`);
    } catch (err) {
      // 失敗しても致命的ではない。続行する (削除も skip 経路に流れるだけ)。
      console.warn(`[docker] disconnect ${ep} from ${name} failed:`, err);
    }
  }

  if (external.length > 0) {
    console.warn(
      `[docker] user network ${name} still has external endpoints (${external.join(", ")}); ` +
        `keeping network (it will be reused by ensureUserNetwork next time)`,
    );
    return;
  }

  try {
    await network.remove();
    console.log(`[docker] user network removed: ${name}`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }
}

// RAG サイドカーを冪等に ensure する。
// - 既存 → 停止中なら start して返す
// - 未作成 → per-user network に join、隔離 ON なら isolated network にも追加接続、
//   9090 をホストにランダム公開 (Next.js から ingest を叩くため)
export async function ensureRagSidecar(
  sub: string,
  isolated: boolean,
): Promise<Docker.Container> {
  const name = ragContainerName(sub);
  const existing = docker.getContainer(name);
  try {
    const info = await existing.inspect();
    if (!info.State.Running) {
      await existing.start();
      console.log(`[docker] started existing rag sidecar: ${name}`);
    }
    return existing;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }

  await ensureRagImageBuilt();
  const userNet = await ensureUserNetwork(sub);
  if (isolated) {
    await ensureIsolatedNetwork();
    await ensureEgressProxyContainer();
  }
  const dataVolume = await ensureRagDataVolume(sub);

  try {
    const created = await docker.createContainer({
      name,
      Image: RAG_IMAGE,
      Labels: {
        [ROLE_LABEL_KEY]: "rag",
        [SUB_LABEL_KEY]: sub,
        ...COMPOSE_LABELS,
        "com.docker.compose.service": `rag-${sanitizeSub(sub)}`,
      },
      Env: [
        `MYWORKSPACES_SUB=${sub}`,
        // 埋め込みとチャットの向き先。隔離 ON / OFF どちらでも
        // host.docker.internal を ExtraHosts で解決させるので URL は共通。
        "LLAMA_CHAT_URL=http://host.docker.internal:8080/v1",
        "LLAMA_EMBED_URL=http://host.docker.internal:8081/v1",
      ],
      ExposedPorts: {
        [`${RAG_INTERNAL_PORT}/tcp`]: {},
      },
      HostConfig: {
        AutoRemove: false,
        RestartPolicy: { Name: "unless-stopped" },
        // 一次的な RAG ワークロードにしては余裕を見て 1GB。Qdrant はオンディスク運用。
        Memory: 1024 * 1024 * 1024,
        PidsLimit: 256,
        CapDrop: ["ALL"],
        CapAdd: ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"],
        SecurityOpt: ["no-new-privileges"],
        Mounts: [
          {
            Type: "volume",
            Source: dataVolume,
            Target: "/data",
          },
        ],
        NetworkMode: userNet,
        // Next.js (= Docker ホスト) から FastAPI にアクセスするため、
        // 9090 をホスト側のランダム port に公開する。getRagSidecarUrl で解決。
        PortBindings: {
          [`${RAG_INTERNAL_PORT}/tcp`]: [{ HostIp: "127.0.0.1", HostPort: "" }],
        },
        ExtraHosts: isolated
          ? [`host.docker.internal:${PROXY_IP}`]
          : ["host.docker.internal:host-gateway"],
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [userNet]: {
            Aliases: [RAG_ALIAS],
          },
        },
      },
    });
    // 隔離 ON のユーザでは、ホスト側 llama-server への到達のために
    // isolated network にも接続しておく (egress-proxy 経由)。
    if (isolated) {
      await docker.getNetwork(ISOLATED_NETWORK).connect({
        Container: name,
      });
    }
    await created.start();
    console.log(`[docker] created rag sidecar: ${name} (isolated=${isolated})`);
    return created;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 409) {
      const c = docker.getContainer(name);
      const info = await c.inspect();
      if (!info.State.Running) await c.start();
      return c;
    }
    throw err;
  }
}

export async function removeRagSidecar(sub: string): Promise<boolean> {
  const name = ragContainerName(sub);
  try {
    await docker.getContainer(name).remove({ force: true });
    console.log(`[docker] removed rag sidecar: ${name}`);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return false;
    throw err;
  }
}

// ログアウト時に user shell と合わせて停止するためのペア。
// named volume (Qdrant storage) は残すので次回ログイン時の start が速い。
export async function stopRagSidecar(sub: string): Promise<boolean> {
  const name = ragContainerName(sub);
  try {
    await docker.getContainer(name).stop({ t: 5 });
    console.log(`[docker] stopped rag sidecar: ${name}`);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return false;
    if (status === 304) return true; // 既に停止済み
    throw err;
  }
}

// Next.js (ホスト) から叩く URL を返す。PortBindings で 127.0.0.1 のランダム port に
// 公開しているので、inspect して実際の割り当て port を取る。sidecar が未起動なら起動する。
export async function getRagSidecarUrl(sub: string): Promise<string> {
  const isolated = await getUserNetworkIsolation(sub);
  const container = await ensureRagSidecar(sub, isolated);
  const info = await container.inspect();
  const bindings = info.NetworkSettings?.Ports?.[`${RAG_INTERNAL_PORT}/tcp`];
  const hostPort = bindings?.[0]?.HostPort;
  if (!hostPort) {
    throw new Error(`rag sidecar ${ragContainerName(sub)} has no host port binding`);
  }
  return `http://127.0.0.1:${hostPort}`;
}

// ─────────────────────────────────────────────
// opencode サイドカー (ensure / remove / stop / URL 解決)
// ─────────────────────────────────────────────

// opencode serve をヘッドレスで常駐させる。shell コンテナと同じ named volume
// を mount することで opencode.db (SQLite WAL) を共有し、TUI と HTTP API で
// セッションを共有する。Image は shell と共通。
//
// session.directory は **serve プロセスの cwd で固定** される (POST /session の
// body で指定しても無視、serve サブコマンドも positional を受け付けない)。
// そのためワークスペース切替時はコンテナを作り直す必要があるが、それは
// activateOpencodeSidecar の責務。この関数は「存在しなければ作る、あれば使う」
// までで、ラベル不一致による再作成は行わない (通常の API 呼び出しで予期せず
// コンテナが落ちるのを避ける)。
//
// - 新規作成時の workspaceId: 引数 > getCurrentWorkspaceId(sub) > 未定の場合 /root
// - 既存コンテナは WorkingDir / Label を問わずそのまま利用 (ユーザが明示的に
//   activate したもの以外、勝手に作り替えない)。
export async function ensureOpencodeSidecar(
  sub: string,
  isolated: boolean,
  workspaceId?: string,
): Promise<Docker.Container> {
  const name = opencodeContainerName(sub);

  const existing = docker.getContainer(name);
  try {
    const info = await existing.inspect();
    if (!info.State.Running) {
      await existing.start();
      console.log(`[docker] started existing opencode sidecar: ${name}`);
    }
    return existing;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }

  // 以下は「新規作成」パス。workspaceId が指定されていればそれを、なければ
  // 現在の current workspace を、さらに無ければ /root を cwd とする。
  const wsId = workspaceId ?? (await getCurrentWorkspaceId(sub));
  const workingDir = wsId ? workspaceCwd(wsId) : "/root";

  // image と user network / egress proxy は shell コンテナと共通で ensure。
  await ensureImageBuilt();
  const userNet = await ensureUserNetwork(sub);
  if (isolated) {
    await ensureIsolatedNetwork();
    await ensureEgressProxyContainer();
  }
  // shell コンテナと同じ home volume を共有。これが DB 共有の核。
  const home = await ensureHomeVolume(sub);

  // 認証。.env に OPENCODE_SERVER_PASSWORD があれば Basic 認証をかける。
  // 空のままだと serve が "server is unsecured" 警告を出すが user-{sub}
  // network 内に閉じているので運用上は問題ない (ホスト公開も 127.0.0.1 bind)。
  const password = process.env.OPENCODE_SERVER_PASSWORD ?? "";

  // Biz パネルの web_search tool が host Next.js (/api/biz/internal/web-search)
  // を叩くための共有トークン。コンテナには値だけ渡し、API キー本体 (TAVILY_API_KEY 等)
  // はホスト側の .env に閉じ込める。BIZ_NEXTJS_INTERNAL_URL を上書きしたい場合は
  // ホスト .env に書いて opencode サイドカー作り直しで反映させる (Phase B)。
  const bizToolToken = process.env.BIZ_TOOL_TOKEN ?? "";
  const bizNextjsUrl = process.env.BIZ_NEXTJS_INTERNAL_URL ?? "";

  try {
    const created = await docker.createContainer({
      name,
      Image: OPENCODE_IMAGE,
      WorkingDir: workingDir,
      Env: [
        "TERM=xterm-256color",
        `MYWORKSPACES_SUB=${sub}`,
        ...(password
          ? [
              `OPENCODE_SERVER_PASSWORD=${password}`,
              "OPENCODE_SERVER_USERNAME=opencode",
            ]
          : []),
        ...(bizToolToken ? [`BIZ_TOOL_TOKEN=${bizToolToken}`] : []),
        ...(bizNextjsUrl ? [`BIZ_NEXTJS_INTERNAL_URL=${bizNextjsUrl}`] : []),
      ],
      Cmd: [
        "opencode",
        "serve",
        "--port",
        String(OPENCODE_INTERNAL_PORT),
        "--hostname",
        "0.0.0.0",
        "--log-level",
        "INFO",
      ],
      Labels: {
        [ROLE_LABEL_KEY]: "opencode-server",
        [SUB_LABEL_KEY]: sub,
        [OPENCODE_WORKSPACE_LABEL]: wsId ?? "",
        ...COMPOSE_LABELS,
        "com.docker.compose.service": `opencode-${sanitizeSub(sub)}`,
      },
      ExposedPorts: {
        [`${OPENCODE_INTERNAL_PORT}/tcp`]: {},
      },
      HostConfig: {
        AutoRemove: false,
        RestartPolicy: { Name: "unless-stopped" },
        Memory: OPENCODE_MEMORY_BYTES,
        PidsLimit: 256,
        // shell コンテナと同等の最小 cap セット (apt 不使用の純粋な Node.js 動作)
        CapDrop: ["ALL"],
        CapAdd: ["CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID"],
        SecurityOpt: ["no-new-privileges"],
        Mounts: [
          {
            Type: "volume",
            Source: home,
            Target: "/root",
          },
        ],
        NetworkMode: userNet,
        // Next.js (ホスト) から HTTP/SSE を叩くため 9091 を 127.0.0.1 の
        // ランダム port に公開。getOpencodeServerUrl で解決する。
        PortBindings: {
          [`${OPENCODE_INTERNAL_PORT}/tcp`]: [
            { HostIp: "127.0.0.1", HostPort: "" },
          ],
        },
        ExtraHosts: isolated
          ? [`host.docker.internal:${PROXY_IP}`]
          : ["host.docker.internal:host-gateway"],
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [userNet]: {
            Aliases: [OPENCODE_ALIAS],
          },
        },
      },
    });
    if (isolated) {
      await docker.getNetwork(ISOLATED_NETWORK).connect({ Container: name });
    }
    await created.start();
    console.log(
      `[docker] created opencode sidecar: ${name} (isolated=${isolated})`,
    );
    return created;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 409) {
      const c = docker.getContainer(name);
      const info = await c.inspect();
      if (!info.State.Running) await c.start();
      return c;
    }
    throw err;
  }
}

// ユーザ操作 (ワークスペース切替) のときだけ呼ぶ。既存コンテナの
// Labels[OPENCODE_WORKSPACE_LABEL] が workspaceId と異なる場合、明示的に
// rm → create して新 cwd で起動し直す。session.directory が変わる。
// ensureOpencodeSidecar と違って「作り替え」を許容するのはこの関数のみ。
export async function activateOpencodeSidecar(
  sub: string,
  isolated: boolean,
  workspaceId: string,
): Promise<Docker.Container> {
  const name = opencodeContainerName(sub);
  const existing = docker.getContainer(name);
  try {
    const info = await existing.inspect();
    const existingWsId = info.Config?.Labels?.[OPENCODE_WORKSPACE_LABEL] ?? "";
    if (existingWsId === workspaceId) {
      if (!info.State.Running) {
        await existing.start();
        console.log(`[docker] started existing opencode sidecar: ${name}`);
      }
      return existing;
    }
    console.log(
      `[docker] opencode sidecar workspace changing (${existingWsId || "-"} -> ${workspaceId}), recreating ${name}`,
    );
    await existing.remove({ force: true });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }
  return ensureOpencodeSidecar(sub, isolated, workspaceId);
}

export async function removeOpencodeSidecar(sub: string): Promise<boolean> {
  const name = opencodeContainerName(sub);
  try {
    await docker.getContainer(name).remove({ force: true });
    console.log(`[docker] removed opencode sidecar: ${name}`);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return false;
    throw err;
  }
}

// ログアウト時に呼ぶ。named volume (SQLite DB) は残すので次回ログイン時の
// start が速い。
export async function stopOpencodeSidecar(sub: string): Promise<boolean> {
  const name = opencodeContainerName(sub);
  try {
    await docker.getContainer(name).stop({ t: 5 });
    console.log(`[docker] stopped opencode sidecar: ${name}`);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return false;
    if (status === 304) return true; // 既に停止済み
    throw err;
  }
}

export async function getOpencodeServerUrl(sub: string): Promise<string> {
  const isolated = await getUserNetworkIsolation(sub);
  const container = await ensureOpencodeSidecar(sub, isolated);
  const info = await container.inspect();
  const bindings =
    info.NetworkSettings?.Ports?.[`${OPENCODE_INTERNAL_PORT}/tcp`];
  const hostPort = bindings?.[0]?.HostPort;
  if (!hostPort) {
    throw new Error(
      `opencode sidecar ${opencodeContainerName(sub)} has no host port binding`,
    );
  }
  return `http://127.0.0.1:${hostPort}`;
}

export async function ensureContainer(
  sub: string,
  net?: NetworkOptions,
): Promise<Docker.Container> {
  const name = containerName(sub);
  const existing = docker.getContainer(name);
  try {
    const info = await existing.inspect();
    if (!info.State.Running) {
      await existing.start();
      console.log(`[docker] started existing container: ${name}`);
    }
    // 既存ユーザコンテナでも rag サイドカーはここで ensure しておく。
    // さらに旧世代のコンテナ (user network 未接続) には後付けで user-{sub} に join。
    const effectiveIsolated = info.HostConfig?.NetworkMode === ISOLATED_NETWORK;
    const userNet = await ensureUserNetwork(sub);
    if (!info.NetworkSettings?.Networks?.[userNet]) {
      try {
        await docker.getNetwork(userNet).connect({ Container: name });
        console.log(`[docker] attached ${name} to ${userNet}`);
      } catch (connErr) {
        console.warn(`[docker] attach ${name} -> ${userNet} failed:`, connErr);
      }
    }
    void ensureRagSidecar(sub, effectiveIsolated).catch((err) =>
      console.warn(`[docker] ensureRagSidecar (warm) failed for ${sub}:`, err),
    );
    void ensureOpencodeSidecar(sub, effectiveIsolated).catch((err) =>
      console.warn(
        `[docker] ensureOpencodeSidecar (warm) failed for ${sub}:`,
        err,
      ),
    );
    return existing;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }

  // 新規作成時のみ隔離判定を行う。明示指定が無ければ DB から取る。
  // 既存コンテナ利用時は DB 値と違っていても干渉しない (切替は API 経由で削除→再作成)。
  const isolated = net?.isolated ?? (await getUserNetworkIsolation(sub));

  // ここに来るのは「コンテナが存在しない」新規作成パスのみ。image が未ビルド
  // (例: `docker rmi` 直後) でも createContainer で 404 にならないよう、必ず
  // ensureImageBuilt を通す。既存コンテナの start パスでは image 不要なので通さない。
  await ensureImageBuilt();

  if (isolated) {
    await ensureIsolatedNetwork();
    await ensureEgressProxyContainer();
  }

  // 隔離 ON/OFF いずれも per-user network を作り、RAG サイドカーと同居させる。
  // これで opencode は常に http://rag-sidecar:9090/v1 で RAG プロキシに到達できる。
  const userNet = await ensureUserNetwork(sub);
  await ensureRagSidecar(sub, isolated);
  // opencode サイドカー (ヘッドレス serve) も同じ per-user network / 同じ
  // home volume で立ち上げ、TUI とセッション DB を共有する。
  await ensureOpencodeSidecar(sub, isolated);

  const home = await ensureHomeVolume(sub);
  try {
    const created = await docker.createContainer({
      name,
      Image: IMAGE,
      Cmd: ["sleep", "infinity"],
      Tty: true,
      OpenStdin: true,
      WorkingDir: "/root",
      Env: ["TERM=xterm-256color", `MYWORKSPACES_SUB=${sub}`],
      Labels: {
        [ROLE_LABEL_KEY]: "session",
        [SUB_LABEL_KEY]: sub,
        ...COMPOSE_LABELS,
        // user 名のサービス名が一番わかりやすいので、ユーザごとに分ける
        "com.docker.compose.service": `shell-${sanitizeSub(sub)}`,
      },
      HostConfig: {
        AutoRemove: false,
        RestartPolicy: { Name: "unless-stopped" },
        Memory: MEM_BYTES,
        NanoCpus: NANO_CPUS,
        PidsLimit: PID_LIMIT,
        // 「ALL ドロップ → apt 等が必要とする最小 cap だけ追加」方針。
        // ptyserver-demo から踏襲。opencode CLI 自体は cap 不要。
        // NET_RAW は ping (RAW ICMP socket) 用。iputils-ping は file cap に頼るが、
        // no-new-privileges 下ではファイルケイパが無効化されるため、コンテナ全体で
        // 明示的に付与する。Sysctls の ping_group_range もセットで有効にしているが、
        // iputils-ping は RAW をまず試す仕様なので、NET_RAW が無いと失敗する。
        CapDrop: ["ALL"],
        CapAdd: [
          "CHOWN",
          "DAC_OVERRIDE",
          "FOWNER",
          "FSETID",
          "SETGID",
          "SETUID",
          "NET_RAW",
        ],
        SecurityOpt: ["no-new-privileges"],
        Sysctls: { "net.ipv4.ping_group_range": "0 2147483647" },
        Mounts: [
          {
            Type: "volume",
            Source: home,
            Target: "/root",
          },
        ],
        // 隔離モード時: Internal: true の自前 bridge に primary で載せる (外向き全遮断)。
        // 非隔離時: per-user bridge に primary で載せ、rag サイドカーを
        // `rag-sidecar` alias で名前解決できるようにする (Docker embedded DNS)。
        // 隔離時も secondary に user network を後付け connect して同じく解決させる。
        NetworkMode: isolated ? ISOLATED_NETWORK : userNet,
        // 非隔離: host-gateway でホストの llama-server (:8080) に直接到達。
        // 隔離: 同一 isolated bridge 上の egress-proxy サイドカーに解決させる。
        //       opencode.json の endpoint (http://host.docker.internal:8080) は
        //       プロキシで同ポートを forward しているので書き換え不要。
        ExtraHosts: isolated
          ? [`host.docker.internal:${PROXY_IP}`]
          : ["host.docker.internal:host-gateway"],
      },
    });
    // 隔離 ON でも RAG サイドカーと通信できるよう user network に secondary attach。
    if (isolated) {
      await docker.getNetwork(userNet).connect({ Container: name });
    }
    await created.start();
    console.log(
      `[docker] created container: ${name} (isolated=${isolated}, userNet=${userNet})`,
    );
    return created;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 409) {
      // 並行リクエストで既に作られたケース: 既存を返す
      const c = docker.getContainer(name);
      const info = await c.inspect();
      if (!info.State.Running) await c.start();
      return c;
    }
    throw err;
  }
}

export async function removeContainer(sub: string): Promise<boolean> {
  const name = containerName(sub);
  // ユーザコンテナと rag / opencode の両サイドカー、per-user network は
  // ライフサイクルを揃える。named volume (home / rag-data) は残して次回起動で再利用。
  await removeRagSidecar(sub);
  await removeOpencodeSidecar(sub);
  try {
    await docker.getContainer(name).remove({ force: true });
    console.log(`[docker] removed container: ${name}`);
    await removeUserNetwork(sub);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) {
      await removeUserNetwork(sub);
      return false;
    }
    throw err;
  }
}

// ログアウト時に呼ぶ。コンテナは停止するだけで削除しない。
// named volume (/root) と apt で入れたものはそのまま残り、次回ログイン時の start が速い。
export async function stopContainer(sub: string): Promise<boolean> {
  const name = containerName(sub);
  try {
    await docker.getContainer(name).stop({ t: 5 });
    console.log(`[docker] stopped container: ${name}`);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return false;
    if (status === 304) return true; // 既に停止済み
    throw err;
  }
}

export async function getContainerStatus(sub: string): Promise<ContainerStatus> {
  const name = containerName(sub);
  try {
    const info = await docker.getContainer(name).inspect();
    const networkMode = info.HostConfig?.NetworkMode ?? undefined;
    return {
      exists: true,
      running: Boolean(info.State?.Running),
      id: typeof info.Id === "string" ? info.Id.slice(0, 12) : undefined,
      networkMode,
      isolated: networkMode === ISOLATED_NETWORK,
    };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return { exists: false, running: false };
    throw err;
  }
}

// ─────────────────────────────────────────────
// Session (WebSocket ↔ docker exec)
// ─────────────────────────────────────────────

type Session = {
  sessionId: string;
  sub: string;
  cwd: string;
  cmd: Cmd;
  exec: Docker.Exec;
  stream: Duplex;
  ws: WebSocket | null;
  outputBuffer: Buffer[];
  outputBufferLen: number;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  dead: boolean;
};

const sessions = new Map<string, Session>();

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function buildExecCmd(cmd: Cmd, cwd: string): string[] {
  const q = shellQuote(cwd);
  // どちらの cmd でも `mkdir -p` で cwd を保証する。
  // 新規ワークスペース直後に接続された場合にも落ちないため。
  if (cmd === "shell") {
    return ["/bin/bash", "-lc", `mkdir -p ${q} && cd ${q} && exec /bin/bash -l`];
  }
  return ["/bin/bash", "-lc", `mkdir -p ${q} && cd ${q} && exec opencode`];
}

function startHeartbeat(s: Session): void {
  stopHeartbeat(s);
  s.heartbeat = setInterval(() => {
    if (s.ws?.readyState === WebSocket.OPEN) s.ws.ping();
  }, HEARTBEAT_MS);
}

function stopHeartbeat(s: Session): void {
  if (s.heartbeat) {
    clearInterval(s.heartbeat);
    s.heartbeat = null;
  }
}

function destroySession(s: Session): void {
  if (s.dead) return;
  s.dead = true;
  stopHeartbeat(s);
  if (s.disconnectTimer) {
    clearTimeout(s.disconnectTimer);
    s.disconnectTimer = null;
  }
  try {
    s.stream.end();
    s.stream.destroy();
  } catch {}
  sessions.delete(s.sessionId);
  console.log(`[docker] session destroyed: ${s.sessionId}`);
}

function detachWs(s: Session): void {
  stopHeartbeat(s);
  s.ws = null;
  console.log(
    `[docker] session detached: ${s.sessionId} (wait ${DISCONNECT_TIMEOUT_MS / 1000}s for reconnect)`,
  );
  s.disconnectTimer = setTimeout(() => destroySession(s), DISCONNECT_TIMEOUT_MS);
}

function attachWsToSession(s: Session, ws: WebSocket): void {
  if (s.disconnectTimer) {
    clearTimeout(s.disconnectTimer);
    s.disconnectTimer = null;
  }
  s.ws = ws;
  startHeartbeat(s);

  try {
    ws.send(JSON.stringify({ type: "session", sessionId: s.sessionId }));
  } catch {}

  if (s.outputBuffer.length > 0) {
    for (const chunk of s.outputBuffer) {
      try {
        ws.send(chunk, { binary: true });
      } catch {}
    }
    s.outputBuffer = [];
    s.outputBufferLen = 0;
  }

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (msg.type === "data") {
      try {
        s.stream.write(Buffer.from(msg.data, "utf-8"));
      } catch {}
    } else if (msg.type === "resize") {
      if (msg.cols > 0 && msg.rows > 0) {
        void s.exec.resize({ h: msg.rows, w: msg.cols }).catch(() => {});
      }
    }
  });

  ws.on("close", () => {
    if (s.ws !== ws) return;
    if (s.dead) return;
    detachWs(s);
  });
}

export type AttachParams = {
  sub: string;
  cwd: string;
  cmd: Cmd;
  ws: WebSocket;
  sessionId?: string | null;
};

export async function attachSession(params: AttachParams): Promise<void> {
  const { sub, cwd, cmd, ws, sessionId } = params;

  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (existing && !existing.dead) {
      if (existing.sub !== sub) {
        ws.close(4403, "sub mismatch");
        return;
      }
      if (existing.ws && existing.ws.readyState === WebSocket.OPEN) {
        try { existing.ws.close(); } catch {}
      }
      attachWsToSession(existing, ws);
      return;
    }
  }

  const container = await ensureContainer(sub);

  const execHandle = await container.exec({
    Cmd: buildExecCmd(cmd, cwd),
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    Env: ["TERM=xterm-256color"],
  });
  // exec.start({Tty:true}) を渡さないと Docker daemon が multiplex ストリームで
  // 返してくる (8 バイトヘッダ付き)。size LSB が TTY 出力として混ざるので必ず指定。
  const stream = (await execHandle.start({
    hijack: true,
    stdin: true,
    Tty: true,
  })) as Duplex;

  const s: Session = {
    sessionId: randomUUID(),
    sub,
    cwd,
    cmd,
    exec: execHandle,
    stream,
    ws: null,
    outputBuffer: [],
    outputBufferLen: 0,
    disconnectTimer: null,
    heartbeat: null,
    dead: false,
  };
  sessions.set(s.sessionId, s);
  console.log(
    `[docker] session spawned: ${s.sessionId} sub=${sub} cwd=${cwd} cmd=${cmd}`,
  );

  stream.on("data", (chunk: Buffer) => {
    if (s.ws && s.ws.readyState === WebSocket.OPEN) {
      try {
        s.ws.send(chunk, { binary: true });
      } catch {}
    } else if (!s.dead) {
      s.outputBuffer.push(chunk);
      s.outputBufferLen += chunk.byteLength;
      while (s.outputBufferLen > OUTPUT_BUFFER_MAX && s.outputBuffer.length > 1) {
        const removed = s.outputBuffer.shift()!;
        s.outputBufferLen -= removed.byteLength;
      }
    }
  });
  stream.on("end", () => {
    if (s.ws && s.ws.readyState === WebSocket.OPEN) {
      try {
        s.ws.send(JSON.stringify({ type: "status", kind: "exit", code: 0 }));
        s.ws.close();
      } catch {}
    }
    destroySession(s);
  });
  stream.on("error", (err) => {
    console.warn("[docker] stream error", err);
    destroySession(s);
  });

  attachWsToSession(s, ws);
}

export function shutdownAllSessions(): void {
  const all = Array.from(sessions.values());
  for (const s of all) destroySession(s);
}

// 特定ユーザのセッションだけを落とす。ログアウト時に使う。
export function shutdownSessionsForSub(sub: string): void {
  for (const s of Array.from(sessions.values())) {
    if (s.sub === sub) destroySession(s);
  }
}
