// ブラウザ ↔ サーバで共有する WebSocket のメッセージ型。
//
// 送信 (クライアント → サーバ):
//   JSON テキストメッセージで制御情報 + キー入力を送る。
//   - { type: "data", data: "..." }          — キー入力 (stdin 相当)
//   - { type: "resize", cols: 80, rows: 24 } — PTY サイズ変更
//
// 受信 (サーバ → クライアント):
//   - テキスト: JSON 制御メッセージ (session ID など)
//   - バイナリ: PTY の生出力 (xterm.js に流す)
export type ClientMessage =
  | { type: "data"; data: string }
  | { type: "resize"; cols: number; rows: number };

export type ServerMessage =
  | { type: "session"; sessionId: string }
  | { type: "status"; kind: "spawn" | "exit"; code?: number };

export const DEFAULT_WS_PATH = "/ws/pty";
