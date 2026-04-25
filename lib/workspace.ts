import { PassThrough, type Readable, Writable } from "node:stream";
import { pack as tarPack, extract as tarExtract } from "tar-stream";
import archiver from "archiver";
import { ensureContainer } from "./docker-session";
import { workspaceCwd } from "./user-store";
import { buildOpencodeJson, getSettings } from "./settings";

const WORKSPACE_ROOT = "/root/workspaces";
const TEMPLATE_DIR = "/opt/myworkspaces/templates";
const MAX_READ_BYTES = 512 * 1024; // 512KB
const MAX_LIST_ENTRIES = 2000;

// opencode.json の instructions に含めたいテンプレ管理のルールファイル。
// 全てワークスペース直下の .opencode/rules/ 配下に置くことで、UI 側の
// 「ドット隠し」と連動して利用者には初期ファイルとして見えなくする。
// syncTemplateRules / createWorkspaceDirectory の両方がこのリストを参照する。
const RULE_FILES = [
  "language-rules.md",
  "vision-rules.md",
  "business-rules.md",
  "pdf-rules.md",
  "coding-rules.md",
];
const RULES_SUBDIR = ".opencode/rules";
const TEMPLATE_RULES = RULE_FILES.map((f) => `${RULES_SUBDIR}/${f}`);

export type DirEntry = {
  name: string;
  isDir: boolean;
  size: number;
  mtimeMs: number;
};

export type FilePayload = {
  path: string;
  size: number;
  truncated: boolean;
  content: string;
};

export class WorkspaceError extends Error {
  constructor(message: string, public status: 400 | 403 | 404 | 500) {
    super(message);
  }
}

// コンテナ内の書き込み可能パスを制限する。UI からの path はここを通さないと
// 扱えない。`/root/workspaces/` の下にあること、`..` を含まないこと。
export function isInsideWorkspaces(p: string): boolean {
  if (!p.startsWith(`${WORKSPACE_ROOT}/`) && p !== WORKSPACE_ROOT) return false;
  if (p.includes("\0")) return false;
  if (p.split("/").some((s) => s === "..")) return false;
  return true;
}

export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// Tty:false の exec 出力は multiplex ストリームで返るため demuxStream で分離。
export async function execCollect(
  sub: string,
  cmd: string[],
  opts: { stdin?: Buffer } = {},
): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }> {
  const container = await ensureContainer(sub);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdin: Boolean(opts.stdin),
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = await exec.start({
    hijack: true,
    stdin: Boolean(opts.stdin),
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const stdoutW = new Writable({
    write(chunk, _enc, cb) {
      stdoutChunks.push(Buffer.from(chunk));
      cb();
    },
  });
  const stderrW = new Writable({
    write(chunk, _enc, cb) {
      stderrChunks.push(Buffer.from(chunk));
      cb();
    },
  });
  container.modem.demuxStream(stream, stdoutW, stderrW);

  if (opts.stdin) {
    stream.write(opts.stdin);
    stream.end();
  }

  await new Promise<void>((resolve, reject) => {
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  const info = await exec.inspect();
  return {
    stdout: Buffer.concat(stdoutChunks),
    stderr: Buffer.concat(stderrChunks),
    exitCode: info.ExitCode ?? -1,
  };
}

// 1 ファイルの中身 (string / Buffer) をコンテナ内パスに書き出すヘルパ。
// putArchive は「展開先ディレクトリ」を指すので、相対パスに dirname/basename を畳み込んで渡す。
export async function writeFileInContainer(
  sub: string,
  absolutePath: string,
  content: Buffer,
): Promise<void> {
  const lastSlash = absolutePath.lastIndexOf("/");
  if (lastSlash <= 0) {
    throw new WorkspaceError("invalid absolute path", 400);
  }
  const targetDir = absolutePath.slice(0, lastSlash);
  const basename = absolutePath.slice(lastSlash + 1);
  const container = await ensureContainer(sub);
  const tar = tarPack();
  tar.entry({ name: basename, size: content.byteLength, mode: 0o644 }, content);
  tar.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of tar as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  await container.putArchive(Buffer.concat(chunks), { path: targetDir });
}

// ワークスペース作成: コンテナ内 /root/workspaces/{id}/ を mkdir し、
// テンプレート (.opencode/tools + language-rules.md + vision-rules.md + business-rules.md)
// をコピーし、opencode.json は ユーザー設定から生成して putArchive で書き込む。
export async function createWorkspaceDirectory(
  sub: string,
  id: string,
): Promise<void> {
  const cwdPath = workspaceCwd(id);
  const cwd = shellQuote(cwdPath);
  const script = [
    `mkdir -p ${cwd}/.opencode/tools ${cwd}/.opencode/rules`,
    `cp -n ${TEMPLATE_DIR}/.opencode/tools/describe_image.ts ${cwd}/.opencode/tools/ 2>/dev/null || true`,
    `cp -n ${TEMPLATE_DIR}/.opencode/tools/read_excel.ts ${cwd}/.opencode/tools/ 2>/dev/null || true`,
    `cp -n ${TEMPLATE_DIR}/.opencode/tools/read_pdf.ts ${cwd}/.opencode/tools/ 2>/dev/null || true`,
    ...RULE_FILES.map(
      (f) =>
        `cp -n ${TEMPLATE_DIR}/.opencode/rules/${f} ${cwd}/.opencode/rules/ 2>/dev/null || true`,
    ),
  ].join(" && ");

  const res = await execCollect(sub, ["/bin/bash", "-c", script]);
  if (res.exitCode !== 0) {
    throw new WorkspaceError(
      `failed to initialize workspace: ${res.stderr.toString("utf-8")}`,
      500,
    );
  }

  // opencode.json は設定から生成。設定読み込みに失敗してもワークスペース自体は
  // 成立させたいのでフォールバックとしてテンプレートを cp する。
  try {
    const settings = await getSettings(sub);
    const json = buildOpencodeJson(settings);
    await writeFileInContainer(sub, `${cwdPath}/opencode.json`, Buffer.from(json, "utf-8"));
  } catch (err) {
    console.warn("[workspace] buildOpencodeJson failed, falling back to template", err);
    await execCollect(sub, [
      "/bin/bash",
      "-c",
      `cp -n ${TEMPLATE_DIR}/opencode.json ${cwd}/ 2>/dev/null || true`,
    ]);
  }
}

// opencode.json の agent ブロックに適用したいデフォルト値。
// opencode schema は agent.<name>.temperature / top_p のみ対応。
// ローカル小型モデル (Gemma 4 E4B 等) の tool call 信頼性を上げる目的で、
// plan は温度をやや高め (発想幅)、build は低め (実装精度) に設定。
const TEMPLATE_AGENT_DEFAULTS: Record<string, { temperature: number; top_p: number }> = {
  plan: { temperature: 0.4, top_p: 0.95 },
  build: { temperature: 0.2, top_p: 0.9 },
};

// 既存ワークスペースにテンプレートの最新設定を再配布する。
// - .opencode/rules/ を mkdir し、テンプレ管理の .md を上書きコピー
//   (ユーザーが直接編集していないことを前提)
// - 旧レイアウト (ワークスペース直下の *-rules.md) が残っていれば削除して移行
// - opencode.json の instructions 配列を新パス (.opencode/rules/<name>) に正規化。
//   旧名のエントリはリネーム、欠損は追加 (順序は既存値を保持)
// - opencode.json の agent.<name> にテンプレデフォルトを追加 (ユーザー設定があれば保持)
// - opencode.json が無い / parse できない場合は merge をスキップ (.md のコピーは行う)
export async function syncTemplateRules(
  sub: string,
  id: string,
): Promise<{
  copiedFiles: string[];
  instructionsAdded: string[];
  agentsAdded: string[];
}> {
  const cwdPath = workspaceCwd(id);
  const cwd = shellQuote(cwdPath);

  // .opencode/rules/ を作って .md を上書きコピー、旧レイアウトのルート直下 .md は削除。
  const cpLines = RULE_FILES.flatMap((f) => [
    `cp ${TEMPLATE_DIR}/.opencode/rules/${f} ${cwd}/.opencode/rules/ 2>/dev/null || true`,
    `rm -f ${cwd}/${f}`,
  ]);
  const script = [`mkdir -p ${cwd}/.opencode/rules`, ...cpLines].join(" && ");
  const cpRes = await execCollect(sub, ["/bin/bash", "-c", script]);
  if (cpRes.exitCode !== 0) {
    throw new WorkspaceError(
      `syncTemplateRules cp failed: ${cpRes.stderr.toString("utf-8")}`,
      500,
    );
  }

  // instructions と agent を merge
  const opencodePath = `${cwdPath}/opencode.json`;
  const instructionsAdded: string[] = [];
  const agentsAdded: string[] = [];
  try {
    const payload = await readFile(sub, opencodePath);
    const json = JSON.parse(payload.content) as {
      instructions?: unknown;
      agent?: unknown;
      [k: string]: unknown;
    };

    // 旧名 → 新パス (.opencode/rules/<name>) の対応表。旧レイアウトからの自動移行で使う。
    const renameMap = new Map<string, string>(
      RULE_FILES.map((f) => [f, `${RULES_SUBDIR}/${f}`]),
    );
    const current = Array.isArray(json.instructions)
      ? (json.instructions as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    let renamed = false;
    const normalized: string[] = [];
    const seen = new Set<string>();
    for (const v of current) {
      const next = renameMap.get(v) ?? v;
      if (next !== v) renamed = true;
      if (!seen.has(next)) {
        seen.add(next);
        normalized.push(next);
      }
    }
    for (const rule of TEMPLATE_RULES) {
      if (!seen.has(rule)) {
        normalized.push(rule);
        seen.add(rule);
        instructionsAdded.push(rule);
      }
    }

    // agent.<name> にテンプレデフォルトを追加 (既存 agent エントリがある場合は保持、
    // 無い場合のみ新規追加。温度の個別上書きは尊重する)
    const currentAgent =
      typeof json.agent === "object" && json.agent !== null
        ? (json.agent as Record<string, unknown>)
        : {};
    const mergedAgent: Record<string, unknown> = { ...currentAgent };
    for (const [name, defaults] of Object.entries(TEMPLATE_AGENT_DEFAULTS)) {
      if (!(name in mergedAgent)) {
        mergedAgent[name] = { ...defaults };
        agentsAdded.push(name);
      }
    }

    const dirty = renamed || instructionsAdded.length > 0 || agentsAdded.length > 0;
    if (dirty) {
      if (renamed || instructionsAdded.length > 0) json.instructions = normalized;
      if (agentsAdded.length > 0) json.agent = mergedAgent;
      const next = JSON.stringify(json, null, 2) + "\n";
      await writeFileInContainer(sub, opencodePath, Buffer.from(next, "utf-8"));
    }
  } catch (err) {
    console.warn("[workspace] syncTemplateRules: skipped opencode.json merge", err);
  }

  return {
    copiedFiles: [...TEMPLATE_RULES],
    instructionsAdded,
    agentsAdded,
  };
}

export async function removeWorkspaceDirectory(
  sub: string,
  id: string,
): Promise<void> {
  // id は createWorkspaceEntry で UUID 切り出しなので英数+アンダースコア前提だが、
  // 念のため shellQuote する。ホストでは無く named volume 内の削除なのでホスト FS は無影響。
  const cwd = shellQuote(workspaceCwd(id));
  const res = await execCollect(sub, ["/bin/bash", "-c", `rm -rf ${cwd}`]);
  if (res.exitCode !== 0) {
    throw new WorkspaceError(
      `failed to remove workspace: ${res.stderr.toString("utf-8")}`,
      500,
    );
  }
}

// find で 1 階層ぶんの子エントリを取得し、パースして返す。
// printf format: <type>\t<size>\t<mtime_seconds>\t<name>\n
export async function listDirectory(
  sub: string,
  dirPath: string,
): Promise<DirEntry[]> {
  if (!isInsideWorkspaces(dirPath)) {
    throw new WorkspaceError("path outside workspaces scope", 403);
  }
  const cmd = [
    "/bin/bash",
    "-c",
    `find ${shellQuote(dirPath)} -mindepth 1 -maxdepth 1 -printf '%y\\t%s\\t%T@\\t%f\\n' 2>/dev/null | head -n ${MAX_LIST_ENTRIES}`,
  ];
  const res = await execCollect(sub, cmd);
  if (res.exitCode !== 0) {
    throw new WorkspaceError(
      `listDirectory failed: ${res.stderr.toString("utf-8")}`,
      500,
    );
  }

  const lines = res.stdout.toString("utf-8").split("\n").filter(Boolean);
  const entries: DirEntry[] = [];
  for (const line of lines) {
    const [type, size, mtime, ...rest] = line.split("\t");
    const name = rest.join("\t"); // 名前に \t が含まれる場合の保険
    if (!name) continue;
    entries.push({
      name,
      isDir: type === "d",
      size: Number(size) || 0,
      mtimeMs: Math.round(Number(mtime) * 1000) || 0,
    });
  }
  // ディレクトリを先に、名前昇順
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export async function readFile(
  sub: string,
  filePath: string,
): Promise<FilePayload> {
  if (!isInsideWorkspaces(filePath)) {
    throw new WorkspaceError("path outside workspaces scope", 403);
  }
  const q = shellQuote(filePath);
  const stat = await execCollect(sub, [
    "/bin/bash",
    "-c",
    `[ -f ${q} ] && stat -c '%s' ${q} || echo __NOT_A_FILE__`,
  ]);
  const statOut = stat.stdout.toString("utf-8").trim();
  if (statOut === "__NOT_A_FILE__") {
    throw new WorkspaceError("not a file", 404);
  }
  const size = Number(statOut) || 0;
  const truncated = size > MAX_READ_BYTES;
  const readCmd = truncated
    ? ["/bin/bash", "-c", `head -c ${MAX_READ_BYTES} ${q}`]
    : ["/bin/bash", "-c", `cat ${q}`];
  const res = await execCollect(sub, readCmd);
  if (res.exitCode !== 0) {
    throw new WorkspaceError(
      `readFile failed: ${res.stderr.toString("utf-8")}`,
      500,
    );
  }
  return {
    path: filePath,
    size,
    truncated,
    // UTF-8 として解釈できない場合は replacement に置き換わる。バイナリ表示はしない方針。
    content: res.stdout.toString("utf-8"),
  };
}

// ホスト → コンテナ内 named volume へファイルを転送する。
// multipart body 等をここに Buffer で渡すと、tar-stream で in-memory tar を作って
// container.putArchive() でストリーミング展開する。
export async function uploadFile(
  sub: string,
  targetDir: string,
  relativePath: string,
  buffer: Buffer,
): Promise<void> {
  if (!isInsideWorkspaces(targetDir)) {
    throw new WorkspaceError("targetDir outside workspaces scope", 403);
  }
  // relativePath は `foo/bar.txt` のような、先頭スラッシュ無し・`..` 非含み。
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    relativePath.includes("\0") ||
    relativePath.split("/").some((s) => s === "..")
  ) {
    throw new WorkspaceError("invalid relativePath", 400);
  }

  const container = await ensureContainer(sub);

  // tar-stream で 1 エントリの tar を作って Buffer に集める。
  const tar = tarPack();
  tar.entry({ name: relativePath, size: buffer.byteLength, mode: 0o644 }, buffer);
  tar.finalize();

  const chunks: Buffer[] = [];
  for await (const chunk of tar as unknown as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  const tarBuf = Buffer.concat(chunks);

  // putArchive の path は「展開先のディレクトリ」。そこに tar 内の相対パスで展開される。
  // 先に mkdir -p で targetDir を保証しておく (削除後の再アップロードなどで消えているケース)。
  const mkRes = await execCollect(sub, [
    "/bin/bash",
    "-c",
    `mkdir -p ${shellQuote(targetDir)}`,
  ]);
  if (mkRes.exitCode !== 0) {
    throw new WorkspaceError(
      `mkdir failed: ${mkRes.stderr.toString("utf-8")}`,
      500,
    );
  }

  await container.putArchive(tarBuf, { path: targetDir });
}

// ワークスペース `/root/workspaces/{workspaceId}` をコンテナから tar で取り出し、
// ZIP に再パックして Readable stream として返す。
//
// Windows 互換のため archiver v7 のデフォルト挙動:
// - general purpose bit flag の bit 11 (EFS / UTF-8 flag) を立てる
// - 各エントリに Info-ZIP Unicode Path Extra Field (0x7075) を付与
// これで最近の Windows 10/11 + 7-Zip / WinRAR で日本語ファイル名が
// 正しく展開される。
export function exportWorkspaceAsZip(
  sub: string,
  workspaceId: string,
): Readable {
  const out = new PassThrough();
  void (async () => {
    try {
      if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
        throw new WorkspaceError("invalid workspaceId", 400);
      }
      const container = await ensureContainer(sub);
      const srcPath = `${WORKSPACE_ROOT}/${workspaceId}`;
      const tarStream = (await container.getArchive({
        path: srcPath,
      })) as Readable;

      const archive = archiver("zip", {
        zlib: { level: 6 },
      });
      archive.on("error", (e) => out.destroy(e));
      archive.pipe(out);

      const extract = tarExtract();
      extract.on("entry", (header, file, next) => {
        const chunks: Buffer[] = [];
        file.on("data", (c: Buffer) => chunks.push(c));
        file.on("end", () => {
          if (header.type === "file") {
            archive.append(Buffer.concat(chunks), {
              name: header.name,
              date: header.mtime ?? new Date(),
              mode: header.mode,
            });
          } else if (header.type === "directory") {
            // 空ディレクトリも保持したいので 0 バイトのエントリとして追加。
            // 非空ディレクトリは下位のファイルから暗黙に作られるので重複しても無害。
            archive.append(Buffer.alloc(0), {
              name: header.name.endsWith("/")
                ? header.name
                : `${header.name}/`,
              date: header.mtime ?? new Date(),
              mode: header.mode,
            });
          }
          // symlink / block / char 等は ZIP で扱いにくいので素直に無視
          next();
        });
        file.on("error", (e) => next(e));
        file.resume();
      });
      extract.on("finish", () => {
        void archive.finalize();
      });
      extract.on("error", (e) => out.destroy(e));
      tarStream.pipe(extract);
    } catch (err) {
      out.destroy(err as Error);
    }
  })();
  return out;
}
