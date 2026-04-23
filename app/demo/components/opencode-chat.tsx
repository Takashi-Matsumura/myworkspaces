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

  // Workspace パネルから ws が切り替わったら、新 ws の opencode.json と
  // session 一覧を取り直し、旧 ws の session を選択したまま放置しない。
  // floating-workspace.tsx の openWorkspace が activate 成功時に dispatch する。
  useEffect(() => {
    const handler = () => {
      setActiveId(null);
      void (async () => {
        await loadConfig();
        await refreshSessions();
      })();
    };
    window.addEventListener("myworkspaces:opencode-activated", handler);
    return () => {
      window.removeEventListener("myworkspaces:opencode-activated", handler);
    };
  }, [loadConfig, refreshSessions]);

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
    // root の font-size を fontSize で設定し、子は全部 em (相対) ベースで
    // 定義する。Tailwind の text-xs / text-sm / text-[10px] は rem 固定で
    // root の font-size を見ないため、A-/A+ 連動のために使わない。
    <div
      className="flex h-full w-full flex-col bg-white text-gray-900"
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}
    >
      <header
        className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2"
        style={{ fontSize: "0.85em" }}
      >
        <span
          className="font-mono font-semibold tracking-tight text-slate-900"
          style={{ fontSize: "1.25em" }}
          aria-label="opencode"
        >
          <span className="text-slate-400">open</span>
          <span className="text-slate-900">code</span>
        </span>
        <span className="text-gray-400" style={{ fontSize: "0.85em" }}>
          チャット
        </span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            state.connected
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-200 text-gray-600"
          }`}
          style={{ fontSize: "0.85em" }}
        >
          {state.connected ? "接続中" : "未接続"}
        </span>
        {config && (
          <span
            className="truncate text-gray-600"
            style={{ fontSize: "0.85em" }}
            title={`${config.providerID}/${config.modelID}`}
          >
            <span className="text-gray-400">モデル:</span>{" "}
            <span className="font-medium text-gray-800">{config.modelName}</span>
            <span className="text-gray-400"> · {config.providerName}</span>
          </span>
        )}
        {activating && (
          <span className="text-gray-500" style={{ fontSize: "0.85em" }}>
            初期化中...
          </span>
        )}
        {activateError && (
          <span
            className="text-red-600"
            style={{ fontSize: "0.85em" }}
            title={activateError}
          >
            初期化エラー
          </span>
        )}
        <button
          type="button"
          onClick={() => void refreshSessions()}
          className="ml-auto rounded p-1 text-gray-500 hover:bg-gray-200"
          title="セッション一覧を再取得"
        >
          <RefreshCw style={{ width: "1.1em", height: "1.1em" }} />
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
    <aside
      className="flex w-48 flex-none flex-col border-r border-gray-200 bg-gray-50"
      style={{ fontSize: "0.85em" }}
    >
      <button
        type="button"
        onClick={() => void onNew()}
        className="flex items-center justify-center gap-1 border-b border-gray-200 bg-emerald-50 py-2 font-medium text-emerald-700 hover:bg-emerald-100"
      >
        <Plus style={{ width: "1.1em", height: "1.1em" }} />
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
                  <div
                    className="truncate text-gray-500"
                    style={{ fontSize: "0.85em" }}
                  >
                    {busy ? "● 応答中" : s.directory ?? ""}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void onDelete(s.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  title="削除"
                >
                  <Trash2
                    className="text-gray-400 hover:text-red-600"
                    style={{ width: "1.1em", height: "1.1em" }}
                  />
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
}: {
  sessionId: string | null;
  messages: { id: string; role: string; partIds: string[] }[];
  parts: Record<string, PartInfo>;
  busy: boolean;
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
      <div className="flex flex-1 items-center justify-center px-6 text-center text-gray-500">
        左側からセッションを選ぶか「新規セッション」を押してください。
        <br />
        既存の Coding/Business パネル TUI で始めた会話もここから続きを書けます。
      </div>
    );
  }

  return (
    // fontSize は root で指定済み (継承)。ここでは em ベースのみ。
    <div
      ref={scrollRef}
      className="flex-1 space-y-4 overflow-y-auto px-4 py-3"
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
          <div
            className="mb-1 font-semibold uppercase tracking-wide text-gray-500"
            style={{ fontSize: "0.7em" }}
          >
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
        <div className="text-emerald-700" style={{ fontSize: "0.9em" }}>
          ● 応答を生成中...
        </div>
      )}
    </div>
  );
}

function MessagePart({ part }: { part: PartInfo }) {
  if (part.type === "reasoning") {
    return (
      <details
        className="mb-2 rounded border border-gray-200 bg-white/70"
        style={{ fontSize: "0.9em" }}
      >
        <summary className="cursor-pointer select-none px-2 py-1 text-gray-500 hover:bg-gray-100">
          思考ログ ({part.text.length} 文字)
        </summary>
        <pre
          className="whitespace-pre-wrap break-words px-3 py-2 font-mono leading-relaxed text-gray-700"
          style={{ fontSize: "0.9em" }}
        >
          {part.text}
        </pre>
      </details>
    );
  }
  if (part.type === "text") {
    // prose は rem 固定 (0.875rem 等) を当てるので inherit で上書きして
    // 親からの em ベース (A-/A+) に連動させる。
    return (
      <div
        className="prose max-w-none"
        style={{ fontSize: "inherit", lineHeight: 1.55 }}
      >
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
}: {
  disabled: boolean;
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  onAbort?: () => void;
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
      />
      {busy && onAbort ? (
        <button
          type="button"
          onClick={onAbort}
          className="flex items-center gap-1 rounded bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-500"
          style={{ fontSize: "0.85em" }}
          title="生成を停止"
        >
          <Square style={{ width: "1.1em", height: "1.1em" }} />
          停止
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || busy}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-500 disabled:bg-gray-300"
          style={{ fontSize: "0.85em" }}
        >
          <Send style={{ width: "1.1em", height: "1.1em" }} />
          送信
        </button>
      )}
    </form>
  );
}
