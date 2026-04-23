import Docker from "dockerode";
import type { Duplex } from "node:stream";
import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { sanitizeSub } from "./user";
import { getUserNetworkIsolation } from "./user-network";
import type { ClientMessage } from "./ws-protocol";

// イメージ / コンテナ / ボリュームの命名規約。
// sub ごとに切り分けるのが myworkspaces の本体。
const IMAGE = "myworkspaces-sandbox:latest";
const DOCKERFILE_CONTEXT = "docker/sandbox";
const CONTAINER_PREFIX = "myworkspaces-shell-";
const VOLUME_PREFIX = "myworkspaces-home-";
const ROLE_LABEL_KEY = "io.myworkspaces.role";
const SUB_LABEL_KEY = "io.myworkspaces.sub";

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
const PROXY_FORWARD_PORT = 8080;

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

// ─────────────────────────────────────────────
// Image / Volume / Container の ensure
// ─────────────────────────────────────────────

export async function ensureImageBuilt(): Promise<void> {
  try {
    await docker.getImage(IMAGE).inspect();
    console.log(`[docker] image ready: ${IMAGE}`);
    return;
  } catch {
    // fall through to build
  }
  console.log(`[docker] building ${IMAGE} from ${DOCKERFILE_CONTEXT}/Dockerfile...`);
  // dockerode の src はディレクトリ名を渡しても再帰展開されないため、ファイルを個別列挙する。
  const buildStream = await docker.buildImage(
    {
      context: DOCKERFILE_CONTEXT,
      src: [
        "Dockerfile",
        "myworkspaces-prompt.sh",
        "templates/describe_image.ts",
        "templates/read_excel.ts",
        "templates/vision-rules.md",
        "templates/business-rules.md",
        "templates/opencode.json",
      ],
    },
    { t: IMAGE, rm: true, labels: { ...COMPOSE_LABELS } },
  );
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      buildStream,
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
  console.log(`[docker] built ${IMAGE}`);
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

// 隔離モード用 egress プロキシ。全ユーザ共有の 1 コンテナ。
// bridge (外向き ok) と isolated の両方に attach し、isolated 側の固定 IP で
// ユーザコンテナからの llama-server 行きトラフィックだけを中継する。
export async function ensureEgressProxyContainer(): Promise<void> {
  const existing = docker.getContainer(PROXY_CONTAINER);
  try {
    const info = await existing.inspect();
    if (!info.State.Running) {
      await existing.start();
      console.log(`[docker] started egress proxy: ${PROXY_CONTAINER}`);
    }
    return;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }

  await ensureIsolatedNetwork();
  await ensureProxyImage();

  try {
    const created = await docker.createContainer({
      name: PROXY_CONTAINER,
      Image: PROXY_IMAGE,
      Cmd: [
        `TCP-LISTEN:${PROXY_FORWARD_PORT},fork,reuseaddr`,
        `TCP:host.docker.internal:${PROXY_FORWARD_PORT}`,
      ],
      Labels: {
        [ROLE_LABEL_KEY]: "egress-proxy",
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
    return existing;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 404) throw err;
  }

  // 新規作成時のみ隔離判定を行う。明示指定が無ければ DB から取る。
  // 既存コンテナ利用時は DB 値と違っていても干渉しない (切替は API 経由で削除→再作成)。
  const isolated = net?.isolated ?? (await getUserNetworkIsolation(sub));
  if (isolated) {
    await ensureIsolatedNetwork();
    await ensureEgressProxyContainer();
  }

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
        // 隔離モード時: Internal: true の自前 bridge に載せる (外向き全遮断)。
        // 非隔離は Docker デフォルトの bridge (未指定) のまま。
        ...(isolated ? { NetworkMode: ISOLATED_NETWORK } : {}),
        // 非隔離: host-gateway でホストの llama-server (:8080) に直接到達。
        // 隔離: 同一 isolated bridge 上の egress-proxy サイドカーに解決させる。
        //       opencode.json の endpoint (http://host.docker.internal:8080) は
        //       プロキシで同ポートを forward しているので書き換え不要。
        ExtraHosts: isolated
          ? [`host.docker.internal:${PROXY_IP}`]
          : ["host.docker.internal:host-gateway"],
      },
    });
    await created.start();
    console.log(
      `[docker] created container: ${name} (isolated=${isolated})`,
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
  try {
    await docker.getContainer(name).remove({ force: true });
    console.log(`[docker] removed container: ${name}`);
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404) return false;
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
