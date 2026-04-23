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
          <ChatThread
            sessionId={activeId}
            messages={activeId ? state.messagesBySession[activeId] ?? [] : []}
            parts={state.parts}
            busy={busy}
            input={input}
            sending={sending}
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

function ChatThread({
  sessionId,
  messages,
  parts,
  busy,
  input,
  sending,
  onChange,
  onSubmit,
  onAbort,
  skills,
}: {
  sessionId: string | null;
  messages: { id: string; role: string; partIds: string[] }[];
  parts: Record<string, PartInfo>;
  busy: boolean;
  input: string;
  sending: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  onAbort?: () => void;
  skills: SkillSummary[];
}) {
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

  // セッション切替時は問答無用で下端に。
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sessionId]);

  // 以後、既に下端近くを見ている時だけ自動追従する。上にスクロールして
  // 過去ログを読んでいる間は、新着 delta や composer の伸縮で引き戻さない。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [totalChars, busy, input]);

  // --- ストリーミング指標 -------------------------------------------------
  // 文字数を live 集計しつつ、応答完了時に llama-server の /tokenize を叩いて
  // 実トークン数に置き換える。tokens/秒 とコンテキスト利用率を表示する。
  const busyStartRef = useRef<{ at: number; chars: number } | null>(null);
  const [lastRun, setLastRun] = useState<{
    chars: number;
    seconds: number;
    tokens: number | null; // /tokenize で確定したら埋まる
  } | null>(null);
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  const [sessionTokens, setSessionTokens] = useState<number | null>(null);

  // llama-server /props からコンテキストウィンドウを 1 度だけ取得。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch("/api/opencode/llama-stats");
        if (!resp.ok) return;
        const j = (await resp.json()) as { contextWindow?: number };
        if (!cancelled && typeof j.contextWindow === "number") {
          setContextWindow(j.contextWindow);
        }
      } catch {
        // llama-server に届かないときは無表示で妥協する。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // busy 中は 300ms 刻みで経過時間を再描画するためのダミー tick。
  // (読み捨てだが、state 更新で親 ChatThread が再レンダされ、
  //  下で `Date.now()` を読んでいる計算が refresh される)
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, [busy]);

  // 最新の assistant 応答テキストとセッション全文を ref で参照可能に保つ。
  // busy→idle の transition effect から、その時点の最新値を読むために使う。
  const latestAssistantTextRef = useRef("");
  const latestSessionTextRef = useRef("");
  useEffect(() => {
    let assistant = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "user") {
        assistant = messages[i].partIds
          .map((pid) => {
            const p = parts[pid];
            // reasoning も tokenize 対象に含める (LLM が受け取る history に入る)
            return p?.text ?? "";
          })
          .join("");
        break;
      }
    }
    latestAssistantTextRef.current = assistant;
    latestSessionTextRef.current = messages
      .flatMap((m) => m.partIds.map((pid) => parts[pid]?.text ?? ""))
      .join("\n");
  }, [messages, parts]);

  // busy の立ち上がり / 立ち下がりで snapshot を更新し、完了時に /tokenize。
  useEffect(() => {
    if (busy) {
      if (!busyStartRef.current) {
        busyStartRef.current = { at: Date.now(), chars: totalChars };
      }
      return;
    }
    if (!busyStartRef.current) return;
    const seconds = (Date.now() - busyStartRef.current.at) / 1000;
    const chars = Math.max(0, totalChars - busyStartRef.current.chars);
    setLastRun({ chars, seconds, tokens: null });
    busyStartRef.current = null;

    // 応答全文 → 正確なトークン数 (tok/s 計算用)
    const assistant = latestAssistantTextRef.current;
    if (assistant) {
      void (async () => {
        try {
          const resp = await fetch("/api/opencode/llama-stats", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: assistant }),
          });
          if (!resp.ok) return;
          const j = (await resp.json()) as { count?: number };
          if (typeof j.count === "number") {
            setLastRun((prev) =>
              prev ? { ...prev, tokens: j.count ?? null } : prev,
            );
          }
        } catch {
          /* 失敗時は lastRun.tokens は null のまま */
        }
      })();
    }
    // セッション全文 → コンテキスト利用率
    const session = latestSessionTextRef.current;
    if (session) {
      void (async () => {
        try {
          const resp = await fetch("/api/opencode/llama-stats", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: session }),
          });
          if (!resp.ok) return;
          const j = (await resp.json()) as { count?: number };
          if (typeof j.count === "number") setSessionTokens(j.count);
        } catch {
          /* ignore */
        }
      })();
    }
  }, [busy, totalChars]);

  // セッションを切り替えたら前回の統計を持ち越さない。
  useEffect(() => {
    setLastRun(null);
    setSessionTokens(null);
    busyStartRef.current = null;
  }, [sessionId]);

  // 前回 run の chars↔tokens 比をストリーム中の推定に流用する。
  // 未キャリブレーションの間は 1 token ≒ 2 chars を暫定値に。
  const tokenRatio =
    lastRun && lastRun.tokens && lastRun.chars > 0
      ? lastRun.tokens / lastRun.chars
      : 0.5;

  const fmt = (n: number) => n.toLocaleString("en-US");
  const ctxBadge =
    sessionTokens !== null && contextWindow
      ? ` · コンテキスト ${fmt(sessionTokens)} / ${fmt(contextWindow)} (${(
          (sessionTokens / contextWindow) *
          100
        ).toFixed(1)}%)`
      : contextWindow && !sessionTokens
        ? ` · コンテキスト ${fmt(contextWindow)} 上限`
        : "";

  let statusLine: string;
  if (busy && busyStartRef.current) {
    const seconds = Math.max(
      0.001,
      (Date.now() - busyStartRef.current.at) / 1000,
    );
    const chars = Math.max(0, totalChars - busyStartRef.current.chars);
    const estTokens = Math.round(chars * tokenRatio);
    const rate = estTokens / seconds;
    statusLine = `⚡ 生成中 · ~${fmt(estTokens)} トークン · ${seconds.toFixed(1)}s · ~${rate.toFixed(1)} トークン/秒${ctxBadge}`;
  } else if (lastRun && lastRun.tokens && lastRun.tokens > 0) {
    const rate = lastRun.tokens / Math.max(0.001, lastRun.seconds);
    statusLine = `直近の応答 · ${fmt(lastRun.tokens)} トークン · ${lastRun.seconds.toFixed(1)}s · ${rate.toFixed(1)} トークン/秒${ctxBadge}`;
  } else if (lastRun && lastRun.chars > 0) {
    // tokenize 結果待ち (ネット遅延等)
    const estTokens = Math.round(lastRun.chars * tokenRatio);
    statusLine = `直近の応答 · ~${fmt(estTokens)} トークン · ${lastRun.seconds.toFixed(1)}s (計測中…)${ctxBadge}`;
  } else if (totalChars > 0) {
    statusLine = `セッション継続中${ctxBadge || ` · ${messages.length} メッセージ`}`;
  } else if (contextWindow) {
    statusLine = `新しい会話を始めましょう · コンテキスト上限 ${fmt(contextWindow)} トークン`;
  } else {
    statusLine = "新しい会話を始めましょう";
  }

  // opencode は step-start / step-finish を挟んで複数の assistant message を
  // 作るため、そのままだと 1 回の返答が複数の吹き出しに見えて読みにくい。
  // 連続する同 role のメッセージを 1 グループにまとめる。
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
    <div
      ref={scrollRef}
      className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-3"
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
      <InlineComposer
        disabled={sending}
        busy={busy}
        value={input}
        onChange={onChange}
        onSubmit={onSubmit}
        onAbort={onAbort}
        skills={skills}
        statusLine={statusLine}
      />
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

// メッセージ履歴のスクロール領域内に「次の下書きメッセージ」として並ぶ
// インライン入力カード。下部固定のチャット欄ではなく会話フローの末尾に
// 居座る形で、複数行入力にも内容量に応じて自動で伸びる。
function InlineComposer({
  disabled,
  busy,
  value,
  onChange,
  onSubmit,
  onAbort,
  skills,
  statusLine,
}: {
  disabled: boolean;
  busy: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void | Promise<void>;
  onAbort?: () => void;
  skills: SkillSummary[];
  statusLine: string;
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
    if (suggestIndex >= suggestions.length) setSuggestIndex(0);
  }, [suggestions.length, suggestIndex]);

  // 内容量に応じて textarea の高さを scrollHeight に追従。
  // 上限は 40em 相当でクリップし、超えたら内部スクロール。
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const style = window.getComputedStyle(ta);
    const emPx = parseFloat(style.fontSize) || 14;
    const max = Math.round(emPx * 40);
    const next = Math.min(ta.scrollHeight, max);
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  const applySuggestion = useCallback(
    (name: string) => {
      onChange(`/${name} `);
      setSuggestIndex(0);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [onChange],
  );

  return (
    <form
      className="relative rounded-lg border border-emerald-300/60 bg-white shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-200"
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) void onSubmit();
      }}
    >
      {showSuggest && (
        <div
          className="absolute bottom-full left-0 right-0 z-10 mb-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
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
      <div
        className="px-3 pt-2 font-semibold uppercase tracking-wide text-emerald-700"
        style={{ fontSize: "0.7em" }}
      >
        あなた (下書き)
      </div>
      <textarea
        ref={textareaRef}
        rows={1}
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
              onChange(value.replace(/^\//, ""));
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (!disabled) void onSubmit();
          }
        }}
        placeholder="メッセージを入力 (Enter で送信 / Shift+Enter で改行 /「/」でスキル)"
        disabled={disabled}
        className="block w-full resize-none border-0 bg-transparent px-3 py-2 leading-relaxed placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:bg-transparent disabled:text-gray-400"
      />
      <div
        className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-1.5"
        style={{ fontSize: "0.8em" }}
      >
        <span
          className={`truncate font-mono ${
            busy ? "text-emerald-700" : "text-gray-500"
          }`}
          title="応答中は文字ベースで推定 (~ 付き)、完了時に llama-server の /tokenize で実トークン数に差し替え。コンテキストはセッション全文のトークン数と上限の比"
        >
          {statusLine}
        </span>
        {busy && onAbort ? (
          <button
            type="button"
            onClick={onAbort}
            className="flex items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-500"
            title="生成を停止"
          >
            <Square style={{ width: "1em", height: "1em" }} />
            停止
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || busy || value.trim().length === 0}
            className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-500 disabled:bg-gray-300"
          >
            <Send style={{ width: "1em", height: "1em" }} />
            送信
          </button>
        )}
      </div>
    </form>
  );
}
