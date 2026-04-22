import "dotenv/config";
import { createServer, type IncomingMessage } from "node:http";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";
import {
  attachSession,
  ensureImageBuilt,
  shutdownAllSessions,
  type Cmd,
} from "./lib/docker-session";
import { getUser } from "./lib/user";
import { DEFAULT_WS_PATH } from "./lib/ws-protocol";

const port = Number(process.env.PORT) || 3000;
const dev = process.env.NODE_ENV !== "production";

const httpServer = createServer();

const app = next({ dev, httpServer });
const handle = app.getRequestHandler();

const WORKSPACE_ROOT = "/root/workspaces";

// cwd が /root/workspaces/{id}/ の形か軽く検証する。
// `..` 等のパストラバーサルと、未サニタイズなシェルメタ文字は弾く。
function isValidCwd(cwd: string): boolean {
  if (!cwd.startsWith(`${WORKSPACE_ROOT}/`) && cwd !== WORKSPACE_ROOT) return false;
  if (cwd.includes("\0")) return false;
  if (cwd.split("/").some((seg) => seg === "..")) return false;
  return true;
}

function parseCmd(raw: string | null): Cmd | null {
  if (raw === "shell") return "shell";
  if (raw === "opencode" || raw === null) return "opencode";
  return null;
}

function rejectEarly(ws: WebSocket, code: number, reason: string): void {
  try { ws.close(code, reason); } catch {}
}

async function handlePtyUpgrade(ws: WebSocket, req: IncomingMessage): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const user = await getUser(req);
    if (!user) {
      rejectEarly(ws, 4401, "unauthorized");
      return;
    }
    const cwd = url.searchParams.get("cwd") ?? WORKSPACE_ROOT;
    const cmd = parseCmd(url.searchParams.get("cmd"));
    const sessionId = url.searchParams.get("sessionId");

    if (!isValidCwd(cwd)) {
      rejectEarly(ws, 4400, "invalid cwd");
      return;
    }
    if (cmd === null) {
      rejectEarly(ws, 4400, "invalid cmd");
      return;
    }

    await attachSession({ sub: user.id, cwd, cmd, ws, sessionId });
  } catch (err) {
    console.error("[server] pty upgrade failed", err);
    rejectEarly(ws, 4500, "internal error");
  }
}

async function main(): Promise<void> {
  await app.prepare();

  // イメージは 1 回だけ build。ホームボリュームはログイン後に遅延作成されるため
  // ここでは事前作成しない。
  try {
    await ensureImageBuilt();
  } catch (err) {
    console.error(
      "[server] startup prep failed — sessions will error until fixed:",
      err,
    );
  }

  httpServer.on("request", (req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname === DEFAULT_WS_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        void handlePtyUpgrade(ws, req);
      });
      return;
    }
    // その他 (Next.js HMR 等) は next が httpServer に登録済みの listener が拾う。
  });

  httpServer.listen(port, () => {
    console.log(
      `[server] listening on http://localhost:${port} (dev=${dev})`,
    );
    console.log(`[server] pty WebSocket at ws://localhost:${port}${DEFAULT_WS_PATH}`);
  });
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[server] received ${sig}, shutting down`);
    shutdownAllSessions();
    httpServer.close(() => process.exit(0));
    // 強制終了のフォールバック
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

main().catch((err) => {
  console.error("[server] fatal", err);
  process.exit(1);
});
