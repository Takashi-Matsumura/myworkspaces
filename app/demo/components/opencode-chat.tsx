"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Plus, Trash2, Send, RefreshCw, Square } from "lucide-react";
import {
  useOpencodeStream,
  type PartInfo,
  type SessionInfo,
} from "./use-opencode-stream";

// Business パネル表面に入る opencode チャット UI。
// TUI (xterm.js の opencode) と session DB を共有する opencode serve サイドカー
// (myworkspaces-opencode-{sub}) に HTTP/SSE で喋る。
//
// - 左: セッション一覧 + 新規 / 削除
// - 右: 選択セッションの履歴 + 入力フォーム
// - Markdown (GFM) + KaTeX レンダリング
// - reasoning part は折りたたみ「思考ログ」ブロック


export default function OpencodeChat({
  fontSize = 13,
}: {
  // パネル側の A- / A+ と連動させるためのメッセージ本文のフォントサイズ。
  // ヘッダーやキャプション類は固定サイズ (可変にすると詰まりやすいため)、
  // 会話本文 (MessageView) と入力欄だけに反映する。
  fontSize?: number;
}) {
  const {
    state,
    refreshSessions,
    loadMessages,
    loadConfig,
    createSession,
    deleteSession,
    sendPrompt,
    abortSession,
  } = useOpencodeStream();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activating, setActivating] = useState(true);
  const [activateError, setActivateError] = useState<string | null>(null);

  // 初回: current workspace を activate してサイドカーの cwd をそこに合わせ、
  // その後セッション一覧を取得する。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wsResp = await fetch("/api/user/workspaces");
        if (!wsResp.ok) throw new Error(`workspaces ${wsResp.status}`);
        const wsJson = (await wsResp.json()) as {
          workspaces?: Array<{ id: string; label: string }>;
        };
        const wid = wsJson.workspaces?.[0]?.id;
        if (wid) {
          const a = await fetch("/api/opencode/activate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ workspaceId: wid }),
          });
          if (!a.ok) throw new Error(`activate ${a.status}`);
        }
        if (!cancelled) {
          await refreshSessions();
          await loadConfig();
        }
      } catch (err) {
        if (!cancelled) setActivateError(String(err));
      } finally {
        if (!cancelled) setActivating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSessions, loadConfig]);

  // 選択セッションが決まったら履歴をロード
  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

  // 送信
  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeId) return;
    setSending(true);
    try {
      const ok = await sendPrompt(activeId, text);
      if (ok) setInput("");
    } finally {
      setSending(false);
    }
  }, [input, activeId, sendPrompt]);

  const onNewSession = useCallback(async () => {
    const s = await createSession();
    if (s) setActiveId(s.id);
  }, [createSession]);

  const onDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      if (activeId === id) setActiveId(null);
    },
    [deleteSession, activeId],
  );

  const busy = activeId ? state.busyBySession[activeId] === true : false;
  const { config } = state;

  return (
    <div className="flex h-full w-full flex-col bg-white text-gray-900">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs">
        <span
          className="font-mono text-base font-semibold tracking-tight text-slate-900"
          aria-label="opencode"
        >
          <span className="text-slate-400">open</span>
          <span className="text-slate-900">code</span>
        </span>
        <span className="text-[10px] text-gray-400">チャット</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${
            state.connected
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-200 text-gray-600"
          }`}
        >
          {state.connected ? "接続中" : "未接続"}
        </span>
        {config && (
          <span
            className="truncate text-[10px] text-gray-600"
            title={`${config.providerID}/${config.modelID}`}
          >
            <span className="text-gray-400">モデル:</span>{" "}
            <span className="font-medium text-gray-800">{config.modelName}</span>
            <span className="text-gray-400"> · {config.providerName}</span>
          </span>
        )}
        {activating && (
          <span className="text-[10px] text-gray-500">初期化中...</span>
        )}
        {activateError && (
          <span className="text-[10px] text-red-600" title={activateError}>
            初期化エラー
          </span>
        )}
        <button
          type="button"
          onClick={() => void refreshSessions()}
          className="ml-auto rounded p-1 text-gray-500 hover:bg-gray-200"
          title="セッション一覧を再取得"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <SessionList
          sessions={state.sessions}
          activeId={activeId}
          busyMap={state.busyBySession}
          onSelect={setActiveId}
          onNew={onNewSession}
          onDelete={onDeleteSession}
        />
        <section className="flex flex-1 flex-col overflow-hidden">
          <MessageView
            sessionId={activeId}
            messages={activeId ? state.messagesBySession[activeId] ?? [] : []}
            parts={state.parts}
            busy={busy}
            fontSize={fontSize}
          />
          <InputForm
            disabled={!activeId || sending}
            busy={busy}
            value={input}
            onChange={setInput}
            onSubmit={onSend}
            onAbort={
              activeId && busy ? () => void abortSession(activeId) : undefined
            }
            fontSize={fontSize}
          />
        </section>
      </div>
    </div>
  );
}

function SessionList({
  sessions,
  activeId,
  busyMap,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: SessionInfo[];
  activeId: string | null;
  busyMap: Record<string, boolean>;
  onSelect: (id: string) => void;
  onNew: () => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  return (
    <aside className="flex w-48 flex-none flex-col border-r border-gray-200 bg-gray-50 text-xs">
      <button
        type="button"
        onClick={() => void onNew()}
        className="flex items-center justify-center gap-1 border-b border-gray-200 bg-emerald-50 py-2 font-medium text-emerald-700 hover:bg-emerald-100"
      >
        <Plus className="h-3.5 w-3.5" />
        新規セッション
      </button>
      <ul className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <li className="px-3 py-4 text-gray-400">セッションはありません</li>
        ) : (
          sessions.map((s) => {
            const busy = busyMap[s.id];
            const active = s.id === activeId;
            return (
              <li
                key={s.id}
                className={`group flex items-center gap-1 border-b border-gray-100 px-2 py-1.5 ${
                  active ? "bg-emerald-100" : "hover:bg-white"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="min-w-0 flex-1 text-left"
                  title={s.id}
                >
                  <div className="truncate font-medium">
                    {s.title || "(無題)"}
                  </div>
                  <div className="truncate text-[10px] text-gray-500">
                    {busy ? "● 応答中" : s.directory ?? ""}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(s.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="削除"
                >
                  <Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-red-600" />
                </button>
              </li>
            );
          })
        )}
      </ul>
    </aside>
  );
}

function MessageView({
  sessionId,
  messages,
  parts,
  busy,
  fontSize,
}: {
  sessionId: string | null;
  messages: { id: string; role: string; partIds: string[] }[];
  parts: Record<string, PartInfo>;
  busy: boolean;
  fontSize: number;
}) {
  // 自動スクロール: 新しい delta で下端に追従
  const scrollRef = useRef<HTMLDivElement>(null);
  const totalChars = useMemo(
    () =>
      messages.reduce(
        (n, m) =>
          n + m.partIds.reduce((k, pid) => k + (parts[pid]?.text?.length ?? 0), 0),
        0,
      ),
    [messages, parts],
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [totalChars, busy]);

  // opencode は step-start / step-finish を挟んで複数の assistant message を
  // 作るため、そのままだと 1 回の返答が複数の吹き出しに見えて読みにくい。
  // 連続する同 role のメッセージを 1 グループにまとめる。
  // (Hooks のルール上、early-return の前に置く必要がある)
  const groups = useMemo(() => {
    type Group = {
      key: string;
      role: string;
      partIds: { pid: string; messageId: string }[];
    };
    const out: Group[] = [];
    for (const m of messages) {
      const last = out[out.length - 1];
      const entries = m.partIds.map((pid) => ({ pid, messageId: m.id }));
      if (last && last.role === m.role) {
        last.partIds.push(...entries);
      } else {
        out.push({ key: m.id, role: m.role, partIds: entries });
      }
    }
    return out;
  }, [messages]);

  if (!sessionId) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-gray-500">
        左側からセッションを選ぶか「新規セッション」を押してください。
        <br />
        既存の Coding/Business パネル TUI で始めた会話もここから続きを書けます。
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      // text-sm は fontSize prop で上書き。子要素の text-[10px] などは絶対値
      // なので固定ラベル (役割名) はサイズ据え置き、本文・Markdown 部分は
      // font-size を継承して A-/A+ に連動する。
      className="flex-1 space-y-4 overflow-y-auto px-4 py-3"
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.5 }}
    >
      {groups.map((g) => (
        <div
          key={g.key}
          className={`rounded-lg px-3 py-2 ${
            g.role === "user"
              ? "bg-gray-100"
              : "border border-emerald-200 bg-emerald-50/40"
          }`}
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {g.role === "user" ? "あなた" : "opencode"}
          </div>
          {g.partIds.map(({ pid, messageId }) => {
            const p = parts[pid];
            if (!p) return null;
            return <MessagePart key={`${messageId}:${pid}`} part={p} />;
          })}
        </div>
      ))}
      {busy && (
        <div className="text-xs text-emerald-700">● 応答を生成中...</div>
      )}
    </div>
  );
}

function MessagePart({ part }: { part: PartInfo }) {
  if (part.type === "reasoning") {
    return (
      <details className="mb-2 rounded border border-gray-200 bg-white/70 text-xs">
        <summary className="cursor-pointer select-none px-2 py-1 text-gray-500 hover:bg-gray-100">
          思考ログ ({part.text.length} 文字)
        </summary>
        <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed text-gray-700">
          {part.text}
        </pre>
      </details>
    );
  }
  if (part.type === "text") {
    return (
      <div className="prose prose-sm max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {part.text}
        </ReactMarkdown>
      </div>
    );
  }
  // step-start / step-finish / tool などは今のところ非表示
  return null;
}

function InputForm({
  disabled,
  busy,
  value,
  onChange,
  onSubmit,
  onAbort,
  fontSize,
}: {
  disabled: boolean;
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  onAbort?: () => void;
  fontSize: number;
}) {
  return (
    <form
      className="flex items-end gap-2 border-t border-gray-200 bg-white px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) void onSubmit();
      }}
    >
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled) void onSubmit();
          }
        }}
        placeholder={
          disabled
            ? "セッションを選ぶと入力できます"
            : "メッセージを入力 (Enter で送信 / Shift+Enter で改行)"
        }
        disabled={disabled}
        className="flex-1 resize-none rounded border border-gray-300 px-2 py-1 focus:border-emerald-500 focus:outline-none disabled:bg-gray-50"
        style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}
      />
      {busy && onAbort ? (
        <button
          type="button"
          onClick={onAbort}
          className="flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
          title="生成を停止"
        >
          <Square className="h-3.5 w-3.5" />
          停止
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || busy}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:bg-gray-300"
        >
          <Send className="h-3.5 w-3.5" />
          送信
        </button>
      )}
    </form>
  );
}
