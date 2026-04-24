"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react";
import {
  useOpencodeStream,
  type PartInfo,
} from "./use-opencode-stream";
import { CHAT_THEMES } from "./chat-theme";
import { CODING_THEME } from "./coding-theme";
import { useStreamStats } from "./use-stream-stats";
import {
  expandSlashCommand,
  InlineComposer,
  ReasoningPart,
  SessionList,
  type SkillSummary,
} from "./opencode-chat";
import { CodeBlock } from "./code-block";
import { PartAsCard } from "./action-card";
import { ProgressPane } from "./progress-pane";

// Coding パネル表面の「Claude Code CLI 風 上下分割 UI」トップレベル。
// OpencodeChat (Business 用) とは別コンポーネントだが、SSE / 状態管理 / 入力
// コンポーザ / 思考ログは共通部品を再利用する。tool / step-start / step-finish
// パートをカードとして可視化し、markdown 内コードは prism-react-renderer で
// ハイライトする点が Business との差別化ポイント。
export default function CodingConsole({ fontSize = 13 }: { fontSize?: number }) {
  const theme = CHAT_THEMES.coding;
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
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  const loadSkills = useCallback(async () => {
    try {
      const resp = await fetch("/api/opencode/skills", { cache: "no-store" });
      if (!resp.ok) return;
      const json = (await resp.json()) as { skills: SkillSummary[] };
      setSkills(json.skills);
    } catch {
      /* noop */
    }
  }, []);

  // 初回: workspace activate → sessions / config 取得 (OpencodeChat と同じ)
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

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

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
    return () =>
      window.removeEventListener("myworkspaces:opencode-activated", handler);
  }, [loadConfig, refreshSessions, loadSkills]);

  useEffect(() => {
    const handler = () => void loadSkills();
    window.addEventListener("myworkspaces:skills-changed", handler);
    return () =>
      window.removeEventListener("myworkspaces:skills-changed", handler);
  }, [loadSkills]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

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
    if (s) {
      setActiveId(s.id);
      setSessionDrawerOpen(false);
    }
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
  const messages = activeId ? state.messagesBySession[activeId] ?? [] : [];
  const { statusLine } = useStreamStats({
    sessionId: activeId,
    messages,
    parts: state.parts,
    busy,
  });

  // 連続同 role を 1 グループに
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

  // スクロール追従 (下端近くなら自動追従、上を読んでいる間は放置)
  const scrollRef = useRef<HTMLDivElement>(null);
  const totalChars = useMemo(
    () =>
      messages.reduce(
        (n, m) =>
          n +
          m.partIds.reduce(
            (k, pid) => k + (state.parts[pid]?.text?.length ?? 0),
            0,
          ),
        0,
      ),
    [messages, state.parts],
  );
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeId]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [totalChars, busy, input]);

  return (
    <div
      className={`flex h-full w-full flex-col ${theme.rootBg} ${theme.rootText} ${theme.rootExtra}`}
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}
    >
      {/* ヘッダー */}
      <header
        className={`flex items-center gap-3 border-b ${theme.headerBorder} ${theme.headerBg} px-3 py-2`}
        style={{ fontSize: "0.85em" }}
      >
        <button
          type="button"
          onClick={() => setSessionDrawerOpen((v) => !v)}
          className={`rounded p-1 ${theme.iconBtn}`}
          title={sessionDrawerOpen ? "セッション一覧を閉じる" : "セッション一覧を開く"}
          aria-label="セッション一覧"
        >
          {sessionDrawerOpen ? (
            <PanelLeftClose style={{ width: "1.1em", height: "1.1em" }} />
          ) : (
            <PanelLeftOpen style={{ width: "1.1em", height: "1.1em" }} />
          )}
        </button>
        <span
          className="font-mono font-semibold tracking-tight"
          style={{ fontSize: "1.25em" }}
        >
          <span className={theme.brandOpen}>open</span>
          <span className={theme.brandCode}>code</span>
        </span>
        <span className={theme.mutedText} style={{ fontSize: "0.85em" }}>
          coding
        </span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            state.connected ? theme.connectedOn : theme.connectedOff
          }`}
          style={{ fontSize: "0.85em" }}
        >
          {state.connected ? "接続中" : "未接続"}
        </span>
        {config && (
          <span
            className={`truncate ${theme.configCwdText}`}
            style={{ fontSize: "0.85em" }}
            title={`${config.providerID}/${config.modelID}`}
          >
            <span className={theme.configLabelText}>モデル:</span>{" "}
            <span className={`font-medium ${theme.configModelText}`}>
              {config.modelName}
            </span>
          </span>
        )}
        {activating && (
          <span className={theme.sidebarMutedSub} style={{ fontSize: "0.85em" }}>
            初期化中...
          </span>
        )}
        {activateError && (
          <span
            className={theme.errorText}
            style={{ fontSize: "0.85em" }}
            title={activateError}
          >
            初期化エラー
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span
            className={`hidden truncate rounded px-2 py-0.5 sm:inline-block ${CODING_THEME.headerStatBadge}`}
            style={{ fontSize: "0.8em" }}
            title={`${statusLine}\n\n応答中は文字ベースで推定 (~ 付き)、完了時に llama-server の /tokenize で実トークン数に差替。コンテキストはセッション全文のトークン数と上限の比。`}
          >
            {statusLine}
          </span>
          <button
            type="button"
            onClick={() => void refreshSessions()}
            className={`rounded p-1 ${theme.iconBtn}`}
            title="セッション一覧を再取得"
          >
            <RefreshCw style={{ width: "1.1em", height: "1.1em" }} />
          </button>
        </span>
      </header>

      {/* メイン (活動フィード + ドロワー) */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* 背景クリックで閉じる透過オーバーレイ (開時のみクリック有効) */}
        <div
          className={`absolute inset-0 z-10 bg-black/20 transition-opacity duration-200 ${
            sessionDrawerOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setSessionDrawerOpen(false)}
          aria-hidden="true"
        />
        {/* ドロワー: 常に DOM に存在し translate-x で出し入れ */}
        <div
          className={`absolute inset-y-0 left-0 z-20 w-48 transition-transform duration-200 ease-out ${
            CODING_THEME.drawerBg
          } ${CODING_THEME.drawerShadow} ${
            sessionDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-hidden={!sessionDrawerOpen}
        >
          <SessionList
            sessions={state.sessions}
            activeId={activeId}
            busyMap={state.busyBySession}
            onSelect={(id) => {
              setActiveId(id);
              setSessionDrawerOpen(false);
            }}
            onNew={onNewSession}
            onDelete={onDeleteSession}
            theme={theme}
          />
        </div>

        <div
          ref={scrollRef}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
        >
          {!activeId ? (
            <div
              className={`flex flex-1 items-center justify-center px-6 ${theme.emptyText}`}
            >
              <p className="max-w-md text-center leading-relaxed">
                左上の
                <PanelLeftOpen className="mx-1 inline-block h-[1em] w-[1em] align-[-0.15em]" />
                からセッションを選ぶか「新規セッション」で開始してください。
                <br />
                既存の Business パネル / opencode TUI で始めた会話もここから続きを書けます。
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <div
                key={g.key}
                className={`rounded-lg px-3 py-2 ${
                  g.role === "user" ? theme.userBubble : theme.assistantBubble
                }`}
              >
                <div
                  className={`mb-1 font-semibold uppercase tracking-wide ${theme.bubbleLabel}`}
                  style={{ fontSize: "0.7em" }}
                >
                  {g.role === "user" ? "あなた" : "opencode"}
                </div>
                {g.partIds.map(({ pid, messageId }) => {
                  const p = state.parts[pid];
                  if (!p) return null;
                  return (
                    <MessagePartCoding
                      key={`${messageId}:${pid}`}
                      part={p}
                    />
                  );
                })}
              </div>
            ))
          )}
          {busy && (
            <div className={theme.assistantAccent} style={{ fontSize: "0.9em" }}>
              ● 応答を生成中...
            </div>
          )}
        </div>
      </main>

      {/* 進捗サマリ (ステップ進行 + 現在実行中 tool) */}
      <ProgressPane
        messages={messages}
        parts={state.parts}
        busy={busy}
        activeId={activeId}
      />

      {/* 下部固定コンポーザ */}
      <div
        className={`flex-none border-t ${theme.headerBorder} ${theme.headerBg} px-3 py-2`}
      >
        <InlineComposer
          disabled={sending || !activeId}
          busy={busy}
          value={input}
          onChange={setInput}
          onSubmit={onSend}
          onAbort={
            activeId && busy ? () => void abortSession(activeId) : undefined
          }
          skills={skills}
          statusLine={statusLine}
          theme={theme}
        />
      </div>
    </div>
  );
}

// Coding 用 MessagePart: reasoning → 既存 ReasoningPart を再利用 /
// text → prism 統合 markdown / tool & step-* → PartAsCard
function MessagePartCoding({ part }: { part: PartInfo }) {
  if (part.type === "reasoning") {
    return <ReasoningPart part={part} theme={CHAT_THEMES.coding} />;
  }
  if (part.type === "text") {
    return (
      <div
        className="prose prose-invert max-w-none"
        style={{ fontSize: "inherit", lineHeight: 1.55 }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            // デフォルトの <pre> を素通し、<code> 側で CodeBlock に差替える
            pre: ({ children }) => <>{children}</>,
            code: (props) => {
              const { className, children } = props as {
                className?: string;
                children?: React.ReactNode;
                inline?: boolean;
              };
              const lang = /language-(\w+)/.exec(className ?? "")?.[1];
              const text = String(children ?? "");
              if (lang) {
                return <CodeBlock language={lang} code={text} />;
              }
              return <code className={className}>{children}</code>;
            },
          }}
        >
          {part.text}
        </ReactMarkdown>
      </div>
    );
  }
  // tool / step-start / step-finish などはカード化
  return <PartAsCard part={part} />;
}
