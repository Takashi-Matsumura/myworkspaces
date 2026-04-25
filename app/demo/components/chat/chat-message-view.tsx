"use client";

import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { PartInfo } from "../use-opencode-stream";
import type { ChatTheme } from "../chat-theme";
import { useStreamStats } from "../use-stream-stats";
import type { SkillSummary } from "../opencode-chat";
import { ReasoningPart } from "./chat-reasoning";
import { InlineComposer } from "./chat-composer";

export function ChatThread({
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
  theme,
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
  theme: ChatTheme;
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

  // ストリーミング指標 (busy 計測 / llama-server /tokenize / コンテキスト率)
  // は use-stream-stats hook に切り出し済み。挙動は従来と等価。
  const { statusLine } = useStreamStats({ sessionId, messages, parts, busy });

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
      <div
        className={`flex flex-1 items-center justify-center px-6 text-center ${theme.emptyText}`}
      >
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
            const p = parts[pid];
            if (!p) return null;
            return (
              <MessagePart
                key={`${messageId}:${pid}`}
                part={p}
                theme={theme}
              />
            );
          })}
        </div>
      ))}
      {busy && (
        <div className={theme.assistantAccent} style={{ fontSize: "0.9em" }}>
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
        theme={theme}
      />
    </div>
  );
}

export function MessagePart({ part, theme }: { part: PartInfo; theme: ChatTheme }) {
  if (part.type === "reasoning") {
    return <ReasoningPart part={part} theme={theme} />;
  }
  if (part.type === "text") {
    // prose は rem 固定 (0.875rem 等) を当てるので inherit で上書きして
    // 親からの em ベース (A-/A+) に連動させる。
    return (
      <div
        className={`prose max-w-none ${theme.proseExtra}`}
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
