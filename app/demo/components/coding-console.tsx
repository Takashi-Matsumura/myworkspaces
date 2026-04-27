"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sparkles,
  Bug,
  Plus,
  ClipboardList,
  Hammer,
} from "lucide-react";
import {
  useOpencodeStream,
  type PartInfo,
} from "./use-opencode-stream";
import { CHAT_THEMES } from "./chat-theme";
import { CODING_THEME } from "./coding-theme";
import { useStreamStats } from "./use-stream-stats";
import { SkillsResponseSchema, WorkspaceMinimalListSchema } from "@/lib/api-schemas";
import { expandSlashCommand, type SkillSummary } from "./opencode-chat";
import { SessionList } from "./chat/session-list";
import { ReasoningPart } from "./chat/chat-reasoning";
import { InlineComposer, type InlineComposerHandle } from "./chat/chat-composer";
import { useChatScrollAndFocus } from "./chat/use-chat-scroll-focus";
import { GeneratingIndicator } from "./chat/generating-indicator";
import { CodeBlock } from "./code-block";
import { PartAsCard } from "./action-card";
import { ProgressPane } from "./progress-pane";

// 入力欄上部のクイックテンプレート。小さいモデルでも「計画 → 実装 → 検証」の
// 手順を踏みやすいように、ツール名 (write / edit / bash) を明示的に指示する。
// 最後に「=== ユーザーの要求 ===」以降の空行にユーザーが具体内容を書く。
const CODING_TEMPLATES: {
  id: "new" | "fix" | "add";
  label: string;
  icon: typeof Sparkles;
  template: string;
}[] = [
  {
    id: "new",
    label: "新規アプリ",
    icon: Sparkles,
    template: `以下の手順で実装してください。

1. 計画: どのファイルを作るか、何のパッケージが必要かを先に箇条書きで整理する
2. 依存: \`bash\` ツールで必要なパッケージを事前にインストール (pip install / npm install 等)
3. 実装: \`write\` ツールに {path, content} を渡してファイルを書き込む
   - pass / TODO / 「実際には〜」のような未実装スタブは残さない
   - main.py と他モジュールの循環 import は禁止
4. 検証: \`bash\` ツールで起動コマンドを実行し、例外なく走ることを確認
5. 完了宣言は検証が通ってからのみ行う

=== ユーザーの要求 ===

`,
  },
  {
    id: "fix",
    label: "バグ修正",
    icon: Bug,
    template: `以下のバグを修正してください。

1. 調査: \`read\` ツールで該当ファイルを読み、問題箇所を特定する
2. 修正: \`edit\` ツールに {path, old_string, new_string} を渡して直す
3. 検証: \`bash\` ツールで再現コマンドを実行し、エラーが解消したことを確認
4. 検証が通るまで完了宣言しない

=== バグの内容 ===

`,
  },
  {
    id: "add",
    label: "機能追加",
    icon: Plus,
    template: `既存のコードに以下の機能を追加してください。

1. 現状把握: \`read\` ツールで関連ファイルを読み、既存コードの構造を把握する
2. 影響範囲: 変更ファイルを整理する (新規ファイルより既存ファイルの編集を優先)
3. 実装: \`edit\` ツールで変更を加える。既存の動作を壊さない
4. 検証: \`bash\` ツールで動作確認コマンドを実行
5. 検証が通るまで完了宣言しない

=== 追加したい機能 ===

`,
  },
];

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
  const [agent, setAgent] = useState<"plan" | "build">("build");
  const [activating, setActivating] = useState(true);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);

  const loadSkills = useCallback(async () => {
    try {
      const resp = await fetch("/api/opencode/skills", { cache: "no-store" });
      if (!resp.ok) return;
      setSkills(SkillsResponseSchema.parse(await resp.json()).skills);
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
        const wsJson = WorkspaceMinimalListSchema.parse(await wsResp.json());
        const wid = wsJson.workspaces[0]?.id;
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
      const ok = await sendPrompt(activeId, expanded, {
        variant: "coding",
        agent,
      });
      if (ok) setInput("");
    } finally {
      setSending(false);
    }
  }, [input, activeId, sendPrompt, skills, agent]);

  const applyTemplate = useCallback((template: string) => {
    setInput(template);
  }, []);

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

  // スクロール追従 (下端近くなら自動追従、上を読んでいる間は放置) と
  // 生成完了時の最下部スナップ + composer フォーカスは共通フックに任せる。
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<InlineComposerHandle>(null);
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
  useChatScrollAndFocus({
    scrollRef,
    composerRef,
    sessionId: activeId,
    totalChars,
    busy,
    input,
  });

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
          {busy && <GeneratingIndicator />}
        </div>
      </main>

      {/* 進捗サマリ (ステップ進行 + 現在実行中 tool + web_search 残数バッジ) */}
      <ProgressPane
        messages={messages}
        parts={state.parts}
        busy={busy}
        activeId={activeId}
        theme={theme}
        showWebSearchBadge
      />

      {/* 下部固定コンポーザ */}
      <div
        className={`flex-none border-t ${theme.headerBorder} ${theme.headerBg} px-3 py-2`}
      >
        {/* Plan / Build 切替 (opencode 組み込みエージェント)。Plan は
            .opencode/plans/*.md のみ編集許可で通常ファイルは書かない設計 */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] text-white/70">モード:</span>
          <div className="inline-flex overflow-hidden rounded border border-white/10">
            <button
              type="button"
              onClick={() => setAgent("plan")}
              disabled={sending}
              title="Plan: 計画書 (.opencode/plans/*.md) だけを書き、実ファイルには手を入れない"
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
                agent === "plan"
                  ? "bg-sky-500/25 text-sky-200"
                  : "text-white/85 hover:bg-white/5 hover:text-white"
              }`}
            >
              <ClipboardList className="h-3 w-3" />
              Plan
            </button>
            <button
              type="button"
              onClick={() => setAgent("build")}
              disabled={sending}
              title="Build: 実ファイルを編集して動作するコードまで書ききる (デフォルト)"
              className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
                agent === "build"
                  ? "bg-emerald-500/25 text-emerald-200"
                  : "text-white/85 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Hammer className="h-3 w-3" />
              Build
            </button>
          </div>
        </div>

        {/* クイックテンプレート: 入力欄に計画→実装→検証の雛形を展開 */}
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-white/70">テンプレ:</span>
          {CODING_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl.template)}
                disabled={sending || !activeId}
                title={`${tpl.label}テンプレを入力欄に展開`}
                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-[11px] text-white/90 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                <Icon className="h-3 w-3" />
                {tpl.label}
              </button>
            );
          })}
        </div>
        <InlineComposer
          ref={composerRef}
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
