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
  Table2,
  FileText,
  Globe,
  Sparkles,
  Image as ImageIcon,
  ClipboardList,
  Search,
  Layers,
  Database,
} from "lucide-react";
import {
  useOpencodeStream,
  type PartInfo,
} from "./use-opencode-stream";
import { CHAT_THEMES } from "./chat-theme";
import { useStreamStats } from "./use-stream-stats";
import {
  SkillsResponseSchema,
  SyncRagResponseSchema,
  WorkspaceMinimalListSchema,
} from "@/lib/api-schemas";
import { expandSlashCommand, type SkillSummary } from "./opencode-chat";
import { SessionList } from "./chat/session-list";
import { ReasoningPart } from "./chat/chat-reasoning";
import { InlineComposer, type InlineComposerHandle } from "./chat/chat-composer";
import { useChatScrollAndFocus } from "./chat/use-chat-scroll-focus";
import { GeneratingIndicator } from "./chat/generating-indicator";
import { CodeBlock } from "./code-block";
import { PartAsCard } from "./action-card";
import { ProgressPane } from "./progress-pane";

// Biz パネルのフェーズ。route.ts の BIZ_PREFIXES と対応。
type BizPhase = "data" | "doc" | "web" | "synth";

// クイックテンプレ。出力先は reports/ または research/ に固定し、入力ファイルを
// `@inputs/<name>` でメンションする習慣を Gemma 4 に教える。
const BIZ_TEMPLATES: {
  id: "kpi-summary" | "pdf-digest" | "image-evidence" | "competitor-scan" | "triangulate";
  label: string;
  icon: typeof Table2;
  phase: BizPhase;
  template: string;
}[] = [
  {
    id: "kpi-summary",
    label: "KPI サマリ",
    icon: Table2,
    phase: "data",
    template: `@inputs/ 配下の CSV/XLSX を集計して、KPI サマリを reports/data-<topic>.md に書いてください。

1. \`bash\` で \`ls inputs/\` を実行し、対象候補を列挙
2. 各 .csv / .xlsx を \`read_excel\` で読み (まず 200 行)、列構成・ヘッダ・期間を把握
3. \`mkdir -p reports\` した上で \`write\` で reports/data-<topic>.md を生成
4. 章立て: ## 概要 / ## 期間と粒度 / ## KPI 表 / ## トレンド (Mermaid pie or barChart) / ## 異常値・欠損 / ## 出典
5. 各記述に出典 (path, sheet "<name>", row N) を必ず添える
6. read_excel で読めない値は「未確認」と書く

=== 補足 (任意。空欄なら全件で動く) ===

`,
  },
  {
    id: "pdf-digest",
    label: "PDF 要約",
    icon: FileText,
    phase: "doc",
    template: `@inputs/ 配下の PDF を要約し、reports/doc-<topic>.md に出力してください。

1. \`bash\` で \`ls inputs/*.pdf\` で対象を列挙
2. 各 PDF を \`read_pdf\` で取得 (まず "1-2" ページで概観 → 必要に応じて続き)
3. \`mkdir -p reports\` 後 \`write\` で reports/doc-<topic>.md を生成
4. 章立て: ## エグゼクティブサマリ (3 段落) / ## 重要数字 (表) / ## 引用ハイライト / ## 留意点
5. 各記述に出典 (path, page N) を必ず添える
6. 数字は read_pdf で確認できたものだけ。読めなかったら「未確認」と書く

=== 補足 (任意) ===

`,
  },
  {
    id: "image-evidence",
    label: "画像エビデンス",
    icon: ImageIcon,
    phase: "doc",
    template: `@inputs/ 配下の画像 (.png/.jpg 等) を読み、reports/doc-images-<topic>.md に整理してください。

1. \`bash\` で \`ls inputs/*.{png,jpg,jpeg,webp,gif} 2>/dev/null\` で対象列挙
2. 各画像を \`describe_image\` で説明取得 (必要に応じて question を渡す)
3. \`write\` で reports/doc-images-<topic>.md を生成
4. 各画像ごとに ### <filename> の見出し + 「写っているもの」「想定文脈」「注意点」の 3 段落
5. 推測でラベルを増やさない。describe_image の出力にないものは書かない

=== 補足 (任意。読み取り目的を入れると describe_image の question に流用) ===

`,
  },
  {
    id: "competitor-scan",
    label: "競合スキャン",
    icon: Search,
    phase: "web",
    template: `指定企業 (または領域) について、Web から多角的に調査し research/<slug>.md にまとめてください。

1. 問いを 3-5 個のサブクエリに分解 (例: "事業領域", "プライシング", "直近 12 ヶ月のプレス", "顧客事例", "技術スタック")
2. 各サブクエリを \`web_search\` (max_results: 5) で検索
3. 上位 2 件は \`web_search\` の \`read_url\` で本文を取得
4. \`bash\` で \`mkdir -p research\` 後、\`write\` で research/<slug>.md に追記
5. 章構成: ## サブクエリ N: ... / 各記述に [^N] 脚注を付ける
6. ファイル末尾に [^N]: <URL> を集約。引用は **3 件以上必須**
7. 一次情報 (公式 / プレス / 公的統計) を優先する

DeepSearch 規律 (business-rules.md と一致):
- 1 ターンに web_search を呼ぶのは最大 5 回
- そのうち read_url での本文取得は最大 2 件まで
- 推測で書かない。確認できなかった項目は「未確認」と明記

=== 調査対象 (例: 競合 SaaS 3 社の最新事業動向) ===

`,
  },
  {
    id: "triangulate",
    label: "三面統合レポート",
    icon: Layers,
    phase: "synth",
    template: `Data / Doc / Web の各成果物を統合し、reports/<topic>-summary.md に多角分析レポートを書いてください。

1. \`bash\` で \`ls reports/ research/ 2>/dev/null\` で既存成果物を列挙
2. 関連する .md を \`read\` で読み込む
3. \`write\` で reports/<topic>-summary.md を生成
4. 章: ## 1. データ視点 (Data) / ## 2. ドキュメント視点 (Doc) / ## 3. Web 視点 (Web) / ## 4. 統合インサイト / ## 5. 推奨アクション
5. 各引用は出典付き (ローカル: path:line または path,page N。Web: [^N] 脚注 + 末尾に集約)
6. 「3 視点が一致する点」「矛盾点」「未確認事項」を箇条書きで明記

=== 統合トピック (例: 競合 X 社 vs. 自社の優位性) ===

`,
  },
];

const PHASE_BUTTONS: {
  id: BizPhase;
  label: string;
  icon: typeof Table2;
  title: string;
}[] = [
  {
    id: "data",
    label: "Data",
    icon: Table2,
    title: "Data: CSV/XLSX を集計し reports/data-*.md に KPI サマリを書く",
  },
  {
    id: "doc",
    label: "Doc",
    icon: FileText,
    title: "Doc: PDF/画像を要約し reports/doc-*.md に出典付きで書く",
  },
  {
    id: "web",
    label: "Web",
    icon: Globe,
    title: "Web: ネット調査 (DeepSearch) で research/<slug>.md を蓄積 (Phase B 以降)",
  },
  {
    id: "synth",
    label: "Synthesize",
    icon: Sparkles,
    title: "Synthesize: reports/ と research/ を統合し reports/<topic>-summary.md を生成",
  },
];

// Biz パネル: ビジネス向けマルチモーダル分析 + (Phase B 以降) DeepSearch。
// Coding/Analyze と同じ opencode サイドカーを共有し、variant + mode で挙動を分ける。
export default function BusinessConsole({ fontSize = 13 }: { fontSize?: number }) {
  const theme = CHAT_THEMES.business;
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
  const [phase, setPhase] = useState<BizPhase>("data");
  const [activating, setActivating] = useState(true);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [syncRagBusy, setSyncRagBusy] = useState(false);
  const [syncRagStatus, setSyncRagStatus] = useState<string | null>(null);
  // Synthesize 送信時に自動で sync-rag を呼ぶフラグ。LocalStorage に保存しない (セッション内のみ)。
  const [autoSyncOnSynthesize, setAutoSyncOnSynthesize] = useState(false);

  const loadSkills = useCallback(async () => {
    try {
      const resp = await fetch("/api/opencode/skills", { cache: "no-store" });
      if (!resp.ok) return;
      setSkills(SkillsResponseSchema.parse(await resp.json()).skills);
    } catch {
      /* noop */
    }
  }, []);

  // 初回: workspace activate → sessions / config 取得 (Coding/Analyze と同じ)
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
          if (!cancelled) setActiveWorkspaceId(wid);
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

  // ワークスペース切替時。floating-workspace.tsx が activate 成功で dispatch。
  useEffect(() => {
    const handler = (ev: Event) => {
      // CustomEvent の detail に新 workspaceId が入っているはず (任意)
      const detail = (ev as CustomEvent<{ workspaceId?: string }>).detail;
      if (detail?.workspaceId) setActiveWorkspaceId(detail.workspaceId);
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

  const runSyncRag = useCallback(
    async (silent = false): Promise<boolean> => {
      if (!activeWorkspaceId) {
        if (!silent) setSyncRagStatus("ワークスペース未確定です。少し待って再試行してください。");
        return false;
      }
      setSyncRagBusy(true);
      if (!silent) setSyncRagStatus("RAG 同期中…");
      try {
        const resp = await fetch("/api/biz/sync-rag", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId: activeWorkspaceId }),
        });
        if (!resp.ok) {
          const errBody = (await resp.json().catch(() => ({}))) as { error?: string };
          setSyncRagStatus(`RAG 同期失敗: ${errBody.error ?? `HTTP ${resp.status}`}`);
          return false;
        }
        const json = SyncRagResponseSchema.parse(await resp.json());
        const total = json.synced.length + json.skipped.length + json.failed.length;
        const newCount = json.synced.filter((s) => !s.updated).length;
        const updCount = json.synced.length - newCount;
        setSyncRagStatus(
          total === 0
            ? "RAG 同期: reports/ research/ に対象なし"
            : `RAG 同期完了: 新規 ${newCount} / 更新 ${updCount} / スキップ ${json.skipped.length} / 失敗 ${json.failed.length}`,
        );
        if (!silent) setTimeout(() => setSyncRagStatus(null), 4000);
        return json.failed.length === 0;
      } catch (err) {
        setSyncRagStatus(`RAG 同期失敗: ${(err as Error).message}`);
        return false;
      } finally {
        setSyncRagBusy(false);
      }
    },
    [activeWorkspaceId],
  );

  const onSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeId) return;
    setSending(true);
    try {
      // Synthesize フェーズで autoSync が ON なら、送信前に同期を試みる。失敗しても送信は続ける。
      if (phase === "synth" && autoSyncOnSynthesize) {
        await runSyncRag(true);
      }
      const expanded = expandSlashCommand(text, skills);
      const ok = await sendPrompt(activeId, expanded, {
        variant: "business",
        mode: phase,
      });
      if (ok) setInput("");
    } finally {
      setSending(false);
    }
  }, [input, activeId, sendPrompt, skills, phase, autoSyncOnSynthesize, runSyncRag]);

  const applyTemplate = useCallback(
    (
      tpl: { template: string; phase: BizPhase },
    ) => {
      setInput(tpl.template);
      setPhase(tpl.phase);
    },
    [],
  );

  // DnD アップロード。inputs/<filename> に配置 → composer に @inputs/<name> を挿入。
  const handleFilesDropped = useCallback(
    async (files: File[]) => {
      if (!activeWorkspaceId) {
        setUploadStatus("ワークスペース未確定です。少し待って再試行してください。");
        return;
      }
      if (files.length === 0) return;
      setUploadStatus(`アップロード中: 0 / ${files.length}`);
      const targetDir = `/root/workspaces/${activeWorkspaceId}`;
      const succeeded: string[] = [];
      const failed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const fd = new FormData();
        fd.append("targetDir", targetDir);
        fd.append("relativePath", `inputs/${f.name}`);
        fd.append("file", f);
        try {
          const resp = await fetch("/api/workspace/upload", {
            method: "POST",
            body: fd,
          });
          if (resp.ok) succeeded.push(f.name);
          else failed.push(f.name);
        } catch {
          failed.push(f.name);
        }
        setUploadStatus(`アップロード中: ${i + 1} / ${files.length}`);
      }
      if (succeeded.length > 0) {
        const mentions = succeeded.map((n) => `@inputs/${n}`).join(" ");
        setInput((prev) => (prev.length === 0 ? mentions + " " : prev + " " + mentions));
        // composer にフォーカスを戻す
        composerRef.current?.focus();
      }
      if (failed.length > 0) {
        setUploadStatus(
          `${succeeded.length} 件成功 / ${failed.length} 件失敗 (${failed.join(", ")})`,
        );
      } else {
        setUploadStatus(`${succeeded.length} 件アップロード完了`);
        // 成功のみなら数秒で消す
        setTimeout(() => setUploadStatus(null), 2500);
      }
    },
    [activeWorkspaceId],
  );

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
          biz
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
            className="hidden truncate rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700 sm:inline-block"
            style={{ fontSize: "0.8em" }}
            title={`${statusLine}\n\n応答中は文字ベースで推定 (~ 付き)、完了時に llama-server の /tokenize で実トークン数に差替。`}
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
          className={`absolute inset-y-0 left-0 z-20 w-48 ${theme.sidebarBg} shadow-2xl shadow-black/10 transition-transform duration-200 ease-out ${
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
                  CSV / XLSX / PDF / 画像をパネル下部にドラッグ&ドロップして取り込み、
                </span>
                <span className="block">
                  フェーズ + テンプレを選んで送信すると <code>reports/*.md</code> に
                  分析レポートが生成されます。
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
                    <MessagePartBiz
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
        {/* フェーズ切替 (route.ts の BIZ_PREFIXES と対応) */}
        <div className="mb-2 flex items-center gap-2">
          <span className={theme.phaseLabel} style={{ fontSize: "0.7em" }}>
            フェーズ:
          </span>
          <div
            className={`inline-flex overflow-hidden rounded ${theme.phaseGroupBorder}`}
          >
            {PHASE_BUTTONS.map((btn) => {
              const Icon = btn.icon;
              const active = phase === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setPhase(btn.id)}
                  disabled={sending}
                  title={btn.title}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 transition-colors disabled:opacity-40 ${
                    active ? theme.phaseTabActive : theme.phaseTabInactive
                  }`}
                  style={{ fontSize: "0.75em" }}
                >
                  <Icon className="h-3 w-3" />
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* クイックテンプレート */}
        <div className="mb-2 flex flex-wrap items-center gap-1">
          <span className={theme.templateLabel} style={{ fontSize: "0.7em" }}>
            <ClipboardList
              className="mr-0.5 inline-block align-[-0.15em]"
              style={{ width: "1em", height: "1em" }}
            />
            テンプレ:
          </span>
          {BIZ_TEMPLATES.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl)}
                disabled={sending || !activeId}
                title={`${tpl.label} (${tpl.phase} フェーズ) のテンプレを入力欄に展開`}
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors disabled:opacity-40 ${theme.templateBtn}`}
                style={{ fontSize: "0.75em" }}
              >
                <Icon className="h-3 w-3" />
                {tpl.label}
              </button>
            );
          })}
        </div>

        {/* RAG 同期: reports/ research/ を一括 ingest。Synthesize フェーズでは送信前自動同期トグルも出す。 */}
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runSyncRag()}
            disabled={syncRagBusy || !activeWorkspaceId}
            title="reports/ と research/ 配下の Markdown を RAG (Qdrant) に取り込み、recall_research の検索対象にする"
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 transition-colors disabled:opacity-40 ${theme.templateBtn}`}
            style={{ fontSize: "0.75em" }}
          >
            <Database
              className={`h-3 w-3 ${syncRagBusy ? "animate-pulse" : ""}`}
            />
            {syncRagBusy ? "RAG 同期中…" : "RAG 同期"}
          </button>
          {phase === "synth" && (
            <label
              className={`inline-flex items-center gap-1 ${theme.phaseLabel}`}
              style={{ fontSize: "0.7em" }}
              title="Synthesize 送信前に自動で RAG 同期を実行"
            >
              <input
                type="checkbox"
                checked={autoSyncOnSynthesize}
                onChange={(e) => setAutoSyncOnSynthesize(e.target.checked)}
                disabled={sending}
                className="h-3 w-3"
              />
              送信前に自動同期
            </label>
          )}
          {syncRagStatus && (
            <span className={theme.phaseLabel} style={{ fontSize: "0.7em" }}>
              · {syncRagStatus}
            </span>
          )}
        </div>

        {uploadStatus && (
          <div
            className={`mb-1 ${theme.phaseLabel}`}
            style={{ fontSize: "0.7em" }}
          >
            {uploadStatus}
          </div>
        )}

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
          onFilesDropped={handleFilesDropped}
        />
      </div>
    </div>
  );
}

// Biz 用 MessagePart: reasoning / text / その他で振り分け。
// テーマは business 専用 (白地 + emerald)。
function MessagePartBiz({ part }: { part: PartInfo }) {
  if (part.type === "reasoning") {
    return <ReasoningPart part={part} theme={CHAT_THEMES.business} />;
  }
  if (part.type === "text") {
    return (
      <div
        className="prose max-w-none"
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
