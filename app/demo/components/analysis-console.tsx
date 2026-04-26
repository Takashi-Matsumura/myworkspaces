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
  Telescope,
  Boxes,
  Plug,
  Database,
  ArrowRightLeft,
  FileSearch,
} from "lucide-react";
import {
  useOpencodeStream,
  type PartInfo,
} from "./use-opencode-stream";
import { CHAT_THEMES } from "./chat-theme";
import { ANALYSIS_THEME } from "./analysis-theme";
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

// Analyze パネルの分析フェーズ。route.ts の ANALYZE_PREFIXES と対応。
type AnalyzeMode = "survey" | "detail" | "port";

// 入力欄上部のクイックテンプレート。出力先は docs/analysis/<NN-name>.md に固定し、
// 根拠 (path:line) 併記を毎回ルール側に念押しする。実装ファイルは書き換えない。
const ANALYZE_TEMPLATES: {
  id: "overview" | "modules" | "api" | "data" | "porting";
  label: string;
  icon: typeof Telescope;
  template: string;
}[] = [
  {
    id: "overview",
    label: "全体像把握",
    icon: Telescope,
    template: `このワークスペースのソースコードを概観してください。

1. \`bash\` で \`find . -type f \\( -name '*.cs' -o -name '*.java' -o -name '*.php' \\) | head -200\` を実行して候補を列挙
2. ルートのビルド設定 (\`*.csproj\` / \`pom.xml\` / \`composer.json\` 等) を \`read\` で読み、言語・FW・主要依存を特定
3. エントリポイント (Main / public static void main / index.php / front controller) を見つけて 1 ファイル代表で読む
4. \`bash\` で \`mkdir -p docs/analysis\` を実行
5. \`write\` で \`docs/analysis/00-overview.md\` を保存。章構成は ## 概要 / ## 言語と FW / ## 主要ディレクトリ / ## エントリポイント / ## 推定アーキテクチャ
6. 各記述の根拠は (path:line) 形式で必ず付ける

=== 補足指示 (任意) ===

`,
  },
  {
    id: "modules",
    label: "クラス・関数一覧",
    icon: Boxes,
    template: `主要モジュールのクラス・関数一覧を作ってください。

1. 対象ディレクトリを \`bash\` で \`find -maxdepth 3 -type d\` で列挙
2. 上位 20 ファイルを \`read\` で読み、public クラス / public メソッドを抽出
3. \`write\` で \`docs/analysis/10-modules.md\` を作成
4. 章構成: ## モジュール一覧 (表) / ## クラス・関数 (file 単位の見出し) / ## 依存関係グラフ (mermaid)
5. 推測で書かない。読めなかった箇所は「未読」と明記する

=== 対象範囲 (空欄なら repo 全体) ===

`,
  },
  {
    id: "api",
    label: "API 仕様抽出",
    icon: Plug,
    template: `公開 API (HTTP エンドポイント / 公開クラスの公開メソッド) を抽出してください。

1. \`bash\` の grep で検出:
   - C#: \`grep -rn "\\[Route\\|\\[Http"\`
   - Java: \`grep -rn "@RequestMapping\\|@GetMapping\\|@PostMapping"\`
   - PHP: \`grep -rn "Route::\\|extends Controller"\`
2. 各エンドポイントの URL / method / path param / query / body / response を \`read\` で読み解く
3. \`write\` で \`docs/analysis/20-api.md\` に Markdown 表で出力
   | path | method | params | request body | response | 認証 | 根拠 (path:line) |
4. 表の前に「## 認証・認可方針」「## 共通レスポンス形式」の節を置く

=== 補足 (任意) ===

`,
  },
  {
    id: "data",
    label: "データモデル抽出",
    icon: Database,
    template: `永続データモデルを抽出してください。

1. \`bash\` の grep で検出:
   - C#: \`grep -rn ": DbContext\\|\\[Table\\|\\[Key\\|\\[Column"\`
   - Java: \`grep -rn "@Entity\\|@Table\\|@Column"\`
   - PHP: \`grep -rn "extends Model\\|Schema::create\\|@ORM"\`
2. 各エンティティを \`read\` で確認し、テーブル名・主キー・外部キー・列型を抽出
3. \`write\` で \`docs/analysis/30-data-model.md\` に保存
   - ## エンティティ一覧 (表)
   - ## テーブル定義 (各エンティティを ### で見出し化、列を表に)
   - ## ER 図 (mermaid erDiagram)
4. SQL マイグレーションがあれば順序付きで列挙

=== 補足 (任意) ===

`,
  },
  {
    id: "porting",
    label: "移植ガイド作成",
    icon: ArrowRightLeft,
    template: `このコードを別言語で再実装するエージェント向けの引き継ぎ書を作ってください。

前提: 既存ファイル (\`docs/analysis/00-overview.md\` / \`10-modules.md\` / \`20-api.md\` / \`30-data-model.md\`) があれば \`read\` で読み込み、無ければ最低限の概観だけ取り直す。

成果物: \`docs/analysis/90-porting-guide.md\`

章構成:
- ## 概要 (移植元と推奨移植先の選択肢)
- ## 機能要件 (ユースケース単位で「入力 → 処理 → 出力」を箇条書き)
- ## 非機能要件 (永続化 / 認証 / 並行性 / 例外)
- ## 公開インターフェース契約 (API 表 + サンプル req/res)
- ## 内部副作用 (DB / ファイル / 外部 HTTP / メール / キャッシュ)
- ## 移植時の注意 (言語固有のイディオム差・ライセンス・既知バグ)
- ## 推奨実装順序 (依存少ない順に番号付きリスト)

=== 移植先言語 (未定なら空欄) ===

`,
  },
];

const MODE_BUTTONS: {
  id: AnalyzeMode;
  label: string;
  icon: typeof Telescope;
  title: string;
}[] = [
  {
    id: "survey",
    label: "Survey",
    icon: Telescope,
    title: "Survey: repo 構造把握フェーズ。bash と read を中心に 00-overview.md を書く",
  },
  {
    id: "detail",
    label: "Detail",
    icon: FileSearch,
    title: "Detail: 詳細抽出フェーズ。docs/analysis/ 配下の 10/20/30 系 .md を書く",
  },
  {
    id: "port",
    label: "Port",
    icon: ArrowRightLeft,
    title: "Port: 移植ガイドフェーズ。既存資料を読んで 90-porting-guide.md を生成",
  },
];

// Analyze パネル表面。CodingConsole とほぼ同じ構造だが、
// - theme = CHAT_THEMES.analyze (バイオレット系)
// - agent (plan/build) ではなく mode (survey/detail/port) を持つ
// - テンプレートは ANALYZE_TEMPLATES (実装ではなく分析用)
// - ヘッダ表示は "analyze"
// 同 OpenCode サイドカーを Coding/Business/Analyze で共有しているため、
// 区別は variant + mode の prefix 付加 (route.ts) と analyze-rules.md で行う。
export default function AnalysisConsole({ fontSize = 13 }: { fontSize?: number }) {
  const theme = CHAT_THEMES.analyze;
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
  const [mode, setMode] = useState<AnalyzeMode>("survey");
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

  // 初回: workspace activate → sessions / config 取得 (Coding/Business と同じ)
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
        variant: "analyze",
        mode,
      });
      if (ok) setInput("");
    } finally {
      setSending(false);
    }
  }, [input, activeId, sendPrompt, skills, mode]);

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
          analyze
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
            className={`hidden truncate rounded px-2 py-0.5 sm:inline-block ${ANALYSIS_THEME.headerStatBadge}`}
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
        <div
          className={`absolute inset-0 z-10 bg-black/20 transition-opacity duration-200 ${
            sessionDrawerOpen
              ? "opacity-100"
              : "pointer-events-none opacity-0"
          }`}
          onClick={() => setSessionDrawerOpen(false)}
          aria-hidden="true"
        />
        <div
          className={`absolute inset-y-0 left-0 z-20 w-48 transition-transform duration-200 ease-out ${
            ANALYSIS_THEME.drawerBg
          } ${ANALYSIS_THEME.drawerShadow} ${
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
              <p className="max-w-2xl text-center leading-relaxed">
                <span className="block">
                  左上の
                  <PanelLeftOpen className="mx-1 inline-block h-[1em] w-[1em] align-[-0.15em]" />
                  からセッションを選ぶか「新規セッション」で開始してください。
                </span>
                <span className="block">
                  既存ソースを Workspace に配置した状態でテンプレを選び、
                </span>
                <span className="block">
                  <code>docs/analysis/*.md</code> に設計資料を生成します。
                </span>
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
                    <MessagePartAnalyze
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
        {/* 分析フェーズ切替 (route.ts の ANALYZE_PREFIXES と対応) */}
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] text-white/40">フェーズ:</span>
          <div className="inline-flex overflow-hidden rounded border border-white/10">
            {MODE_BUTTONS.map((btn) => {
              const Icon = btn.icon;
              const active = mode === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setMode(btn.id)}
                  disabled={sending}
                  title={btn.title}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] transition-colors disabled:opacity-40 ${
                    active
                      ? "bg-violet-500/25 text-violet-200"
                      : "text-white/60 hover:bg-white/5 hover:text-white/90"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* クイックテンプレート: 入力欄に分析手順の雛形を展開 */}
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-white/40">テンプレ:</span>
          {ANALYZE_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl.template)}
                disabled={sending || !activeId}
                title={`${tpl.label}テンプレを入力欄に展開`}
                className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-0.5 text-[11px] text-white/70 transition-colors hover:bg-white/5 hover:text-white/90 disabled:opacity-40"
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

// Analyze 用 MessagePart: reasoning → ReasoningPart 再利用 (テーマだけ analyze)
// text → prism 統合 markdown / tool & step-* → PartAsCard
function MessagePartAnalyze({ part }: { part: PartInfo }) {
  if (part.type === "reasoning") {
    return <ReasoningPart part={part} theme={CHAT_THEMES.analyze} />;
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
  return <PartAsCard part={part} />;
}
