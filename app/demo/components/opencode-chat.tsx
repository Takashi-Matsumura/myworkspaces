"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Plus,
  Trash2,
  Send,
  RefreshCw,
  Square,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import {
  useOpencodeStream,
  type PartInfo,
  type SessionInfo,
} from "./use-opencode-stream";

export type SkillSummary = {
  name: string;
  description: string;
};

// 入力の先頭が `/<name> ...` でその name が登録済みスキルにマッチしたら、
// opencode 側でスキル選択が確実に走るよう prompt を wrap する。
// マッチしない場合は原文のまま送る (スラッシュ付き文章を送りたい人の道を塞がない)。
function expandSlashCommand(text: string, skills: SkillSummary[]): string {
  const m = text.match(/^\/([a-z0-9][a-z0-9_-]{0,62})(?:\s+([\s\S]*))?$/);
  if (!m) return text;
  const sname = m[1];
  if (!skills.some((s) => s.name === sname)) return text;
  const rest = (m[2] ?? "").trim();
  return `スキル「${sname}」を使って、以下のユーザーリクエストに応答してください。\n\n${rest}`;
}

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
  const [sessionListCollapsed, setSessionListCollapsed] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  // ユーザー全体スキルの一覧を取得。スラッシュコマンドのサジェストに使う。
  const loadSkills = useCallback(async () => {
    try {
      const resp = await fetch("/api/opencode/skills", { cache: "no-store" });
      if (!resp.ok) return;
      const json = (await resp.json()) as { skills: SkillSummary[] };
      setSkills(json.skills);
    } catch {
      // サジェストが出ないだけなのでチャット自体は壊さない。
    }
  }, []);

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
        await loadSkills();
      })();
    };
    window.addEventListener("myworkspaces:opencode-activated", handler);
    return () => {
      window.removeEventListener("myworkspaces:opencode-activated", handler);
    };
  }, [loadConfig, refreshSessions, loadSkills]);

  // スキル設定画面での CRUD 完了時に再取得してサジェストに反映させる。
  useEffect(() => {
    const handler = () => void loadSkills();
    window.addEventListener("myworkspaces:skills-changed", handler);
    return () => {
      window.removeEventListener("myworkspaces:skills-changed", handler);
    };
  }, [loadSkills]);

  // 初回マウントでもスキルをロード (上の activate 経由が走る前にサジェストを出せるように)。
  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  // 送信
  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeId) return;
    setSending(true);
    try {
      const expanded = expandSlashCommand(text, skills);
      const ok = await sendPrompt(activeId, expanded);
      if (ok) setInput("");
    } finally {
      setSending(false);
    }
  }, [input, activeId, sendPrompt, skills]);

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
        <button
          type="button"
          onClick={() => setSessionListCollapsed((v) => !v)}
          className="rounded p-1 text-gray-500 hover:bg-gray-200"
          title={
            sessionListCollapsed ? "セッション一覧を展開" : "セッション一覧を折りたたむ"
          }
          aria-label={
            sessionListCollapsed ? "セッション一覧を展開" : "セッション一覧を折りたたむ"
          }
        >
          {sessionListCollapsed ? (
            <PanelLeftOpen style={{ width: "1.1em", height: "1.1em" }} />
          ) : (
            <PanelLeftClose style={{ width: "1.1em", height: "1.1em" }} />
          )}
        </button>
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
        {!sessionListCollapsed && (
          <SessionList
            sessions={state.sessions}
            activeId={activeId}
            busyMap={state.busyBySession}
            onSelect={setActiveId}
            onNew={onNewSession}
            onDelete={onDeleteSession}
          />
        )}
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
            skills={skills}
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
  skills,
}: {
  disabled: boolean;
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  onAbort?: () => void;
  skills: SkillSummary[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [suggestIndex, setSuggestIndex] = useState(0);

  // 入力の先頭が `/<prefix>` の形ならサジェストを出す。空の `/` は全件表示。
  const suggestions = useMemo(() => {
    const m = value.match(/^\/([a-z0-9_-]*)$/i);
    if (!m) return [] as SkillSummary[];
    const prefix = m[1].toLowerCase();
    return skills.filter((s) => s.name.startsWith(prefix));
  }, [value, skills]);

  const showSuggest = !disabled && suggestions.length > 0;

  useEffect(() => {
    // 候補の絞り込みで index が範囲外になったら先頭に戻す。
    if (suggestIndex >= suggestions.length) setSuggestIndex(0);
  }, [suggestions.length, suggestIndex]);

  const applySuggestion = useCallback(
    (name: string) => {
      onChange(`/${name} `);
      // applySuggestion 直後は suggestions が空になるので popup は閉じる。
      setSuggestIndex(0);
      // focus を戻す (候補ボタンクリックで外れた分)
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [onChange],
  );

  return (
    <form
      className="relative flex items-stretch gap-2 border-t border-gray-200 bg-white px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) void onSubmit();
      }}
    >
      {showSuggest && (
        <div
          className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
          style={{ fontSize: "0.9em" }}
        >
          <div
            className="border-b border-gray-100 bg-gray-50 px-2 py-1 text-gray-500"
            style={{ fontSize: "0.8em" }}
          >
            スキル (Tab / Enter で挿入、Esc で閉じる)
          </div>
          <ul>
            {suggestions.map((s, i) => (
              <li key={s.name}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // blur で popup が消える前に onClick させる。
                    e.preventDefault();
                    applySuggestion(s.name);
                  }}
                  className={`block w-full px-3 py-1.5 text-left ${
                    i === suggestIndex
                      ? "bg-emerald-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="font-mono font-medium text-emerald-700">
                    /{s.name}
                  </div>
                  <div
                    className="truncate text-gray-500"
                    style={{ fontSize: "0.85em" }}
                  >
                    {s.description || "(説明なし)"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <textarea
        ref={textareaRef}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (showSuggest) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSuggestIndex((i) => Math.min(suggestions.length - 1, i + 1));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSuggestIndex((i) => Math.max(0, i - 1));
              return;
            }
            if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
              e.preventDefault();
              const chosen = suggestions[suggestIndex];
              if (chosen) applySuggestion(chosen.name);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              // 先頭の `/` を消してサジェスト自体を畳む。
              onChange(value.replace(/^\//, ""));
              return;
            }
          }
          // 通常の Enter 送信。
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled) void onSubmit();
          }
        }}
        placeholder={
          disabled
            ? "セッションを選ぶと入力できます"
            : "メッセージを入力 (Enter で送信 / Shift+Enter で改行 /「/」でスキル)"
        }
        disabled={disabled}
        className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 focus:border-emerald-500 focus:outline-none disabled:bg-gray-50"
      />
      {busy && onAbort ? (
        <button
          type="button"
          onClick={onAbort}
          className="flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-4 font-medium text-white hover:bg-red-500"
          title="生成を停止"
        >
          <Square style={{ width: "1.1em", height: "1.1em" }} />
          停止
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || busy}
          className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 font-medium text-white hover:bg-emerald-500 disabled:bg-gray-300"
        >
          <Send style={{ width: "1.1em", height: "1.1em" }} />
          送信
        </button>
      )}
    </form>
  );
}
