"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { buildPtyUrl, type ClientMessage, type ServerMessage } from "../lib/ws-protocol";

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 2000;

export default function XtermView({
  cwd,
  cmd,
  fontSize = 13,
}: {
  cwd: string;
  cmd?: "opencode" | "shell" | null;
  fontSize?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, "Geist Mono", monospace',
      fontSize,
      lineHeight: 1.0,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: "bar",
      // スクロールバックを広めに取って、貼り付け直後に過去出力が飛ばないようにする。
      scrollback: 10000,
      // Cmd/Option 系のキーバインドが bash の Meta (Alt) として届くようにする。
      macOptionIsMeta: true,
      // 右クリック時に単語選択 → コピーメニューを出す挙動。
      rightClickSelectsWord: true,
      // PTY 側で \r\n を自然に扱うので変換は不要。
      convertEol: false,
      theme: {
        background: "#0b0b0f",
        foreground: "#e6e6ea",
        cursor: "#e6e6ea",
      },
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {}
    fit.fit();

    const textarea = el.querySelector("textarea");
    textarea?.blur();

    let sessionId: string | null = null;
    let ws: WebSocket | null = null;
    let retries = 0;
    let disposed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const send = (msg: ClientMessage) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    };

    const dataSub = term.onData((data) => send({ type: "data", data }));

    function connect() {
      if (disposed) return;
      const url = buildPtyUrl({ cwd, cmd: cmd ?? null, sessionId });
      ws = new WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        retries = 0;
        send({ type: "resize", cols: term.cols, rows: term.rows });
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          try {
            const msg: ServerMessage = JSON.parse(ev.data);
            if (msg.type === "session") {
              sessionId = msg.sessionId;
              return;
            }
            if (msg.type === "status") {
              // 必要に応じて UI に通知 (現状は無視)。
              return;
            }
          } catch {}
          term.write(ev.data);
        } else {
          term.write(new Uint8Array(ev.data as ArrayBuffer));
        }
      };

      ws.onclose = (ev) => {
        if (disposed) return;
        // 4xxx のカスタムコードは「再接続しても無駄」のサイン
        if (ev.code >= 4400 && ev.code < 4500) {
          term.write(`\r\n\x1b[31m[${ev.reason || "rejected"}]\x1b[0m\r\n`);
          return;
        }
        if (retries < MAX_RETRIES) {
          retries++;
          term.write(`\r\n\x1b[33m[reconnecting ${retries}/${MAX_RETRIES}...]\x1b[0m\r\n`);
          retryTimer = setTimeout(connect, RETRY_INTERVAL_MS);
        } else {
          term.write("\r\n\x1b[31m[connection lost]\x1b[0m\r\n");
        }
      };

      ws.onerror = () => {};
    }

    connect();

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        send({ type: "resize", cols: term.cols, rows: term.rows });
      } catch {}
    });
    ro.observe(el);

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      ro.disconnect();
      dataSub.dispose();
      ws?.close();
      term.dispose();
    };
  }, [cwd, cmd, fontSize]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#0b0b0f] p-2"
      style={{ overflow: "hidden" }}
    />
  );
}
