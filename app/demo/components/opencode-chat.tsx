"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useOpencodeStream } from "./use-opencode-stream";
import { CHAT_THEMES, type ChatVariant } from "./chat-theme";
import { SkillsResponseSchema, WorkspaceMinimalListSchema } from "@/lib/api-schemas";
import { SessionList } from "./chat/session-list";
import { ChatThread } from "./chat/chat-message-view";

// 各 sub component (MessagePart / ReasoningPart / InlineComposer / SessionList) は
// chat/ 配下から直接 import する。SkillSummary 型 と expandSlashCommand は
// チャット層共通のため引き続きこのファイルで定義 (coding-console.tsx でも使われる)。

export type SkillSummary = {
  name: string;
  description: string;
};

// 入力の先頭が `/<name> ...` でその name が登録済みスキルにマッチしたら、
// opencode 側でスキル選択が確実に走るよう prompt を wrap する。
// マッチしない場合は原文のまま送る (スラッシュ付き文章を送りたい人の道を塞がない)。
export function expandSlashCommand(text: string, skills: SkillSummary[]): string {
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
  variant = "business",
}: {
  // パネル側の A- / A+ と連動させるためのメッセージ本文のフォントサイズ。
  // ヘッダーやキャプション類は固定サイズ (可変にすると詰まりやすいため)、
  // 会話本文 (MessageView) と入力欄だけに反映する。
  fontSize?: number;
  // Business (白) / Coding (黒) でテーマを切替。default は後方互換で business。
  variant?: ChatVariant;
}) {
  const theme = CHAT_THEMES[variant];
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
      setSkills(SkillsResponseSchema.parse(await resp.json()).skills);
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
      className={`flex h-full w-full flex-col ${theme.rootBg} ${theme.rootText} ${theme.rootExtra}`}
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.4 }}
    >
      <header
        className={`flex items-center gap-3 border-b ${theme.headerBorder} ${theme.headerBg} px-3 py-2`}
        style={{ fontSize: "0.85em" }}
      >
        <button
          type="button"
          onClick={() => setSessionListCollapsed((v) => !v)}
          className={`rounded p-1 ${theme.iconBtn}`}
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
          className="font-mono font-semibold tracking-tight"
          style={{ fontSize: "1.25em" }}
          aria-label="opencode"
        >
          <span className={theme.brandOpen}>open</span>
          <span className={theme.brandCode}>code</span>
        </span>
        <span className={theme.mutedText} style={{ fontSize: "0.85em" }}>
          チャット
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
            <span className={theme.configLabelText}> · {config.providerName}</span>
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
        <button
          type="button"
          onClick={() => void refreshSessions()}
          className={`ml-auto rounded p-1 ${theme.iconBtn}`}
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
            theme={theme}
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
            theme={theme}
          />
        </section>
      </div>
    </div>
  );
}
