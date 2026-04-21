// UI 側で再利用する WebSocket メッセージ型 + 接続 URL 組み立て。
// サーバ側の /lib/ws-protocol.ts と重複させず、同じエクスポートを透過させる。
export { type ClientMessage, type ServerMessage, DEFAULT_WS_PATH } from "@/lib/ws-protocol";

import { DEFAULT_WS_PATH } from "@/lib/ws-protocol";

export type BuildUrlParams = {
  cwd: string;
  cmd?: "opencode" | "shell" | null;
  sessionId?: string | null;
};

export function buildPtyUrl(params: BuildUrlParams): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const url = new URL(`${scheme}://${location.host}${DEFAULT_WS_PATH}`);
  url.searchParams.set("cwd", params.cwd);
  if (params.cmd) url.searchParams.set("cmd", params.cmd);
  if (params.sessionId) url.searchParams.set("sessionId", params.sessionId);
  return url.toString();
}
