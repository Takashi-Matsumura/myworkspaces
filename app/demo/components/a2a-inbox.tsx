"use client";

import { useMemo, useState } from "react";
import { decode as decodeA2A, type A2AMeta } from "@/lib/a2a/prefix";
import type { MessageInfo, PartInfo } from "./use-opencode-stream";
import type { ChatTheme } from "./chat-theme";

// Phase 2: A2A 別レーン Inbox。
// - ロープ経由で受信した user メッセージ (text 先頭に [[A2A from=...]] prefix を持つ) を
//   通常チャットとは別レーンに集約表示する
// - 折りたたみ式 pill バー: 件数を表示。クリックで展開して各受信メッセージを並べる
// - 表示時は prefix を剥がす (decodeA2A の content 側を表示)
//
// 親コンポーネント (business-console / coding-console) は
//   - state.messagesBySession[activeId]
//   - state.parts
// を渡せば、A2A 受信が無い時は何もレンダリングしない (height 0)。
//
// 通常チャット側 (groups の rendering) では raw.a2a を持つ part を skip させること。

export type A2AInboxItem = {
  partId: string;
  messageId: string;
  meta: A2AMeta;
  content: string;
};

function isA2AMeta(v: unknown): v is A2AMeta {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (o.from === "biz" || o.from === "code") &&
    typeof o.hop === "number" &&
    typeof o.rope === "string"
  );
}

export function extractA2AInboxItems(
  messages: MessageInfo[],
  parts: Record<string, PartInfo>,
): A2AInboxItem[] {
  const items: A2AInboxItem[] = [];
  for (const m of messages) {
    for (const pid of m.partIds) {
      const part = parts[pid];
      if (!part) continue;
      const a2a = part.raw?.a2a;
      if (!isA2AMeta(a2a)) continue;
      const { content } = decodeA2A(part.text);
      items.push({ partId: pid, messageId: m.id, meta: a2a, content });
    }
  }
  return items;
}

export function A2AInbox(props: {
  messages: MessageInfo[];
  parts: Record<string, PartInfo>;
  theme: ChatTheme;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = useMemo(
    () => extractA2AInboxItems(props.messages, props.parts),
    [props.messages, props.parts],
  );
  if (items.length === 0) return null;
  const t = props.theme;
  // 表示は新しいものを上に。
  const reversed = items.slice().reverse();
  return (
    <div className={`border-b ${t.headerBorder} ${t.headerBg}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${t.iconBtn}`}
        style={{ fontSize: "0.85em" }}
        aria-expanded={expanded}
      >
        <span aria-hidden>💬</span>
        <span className="font-medium">相手から ({items.length})</span>
        <span className="ml-auto opacity-60" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
      </button>
      {expanded && (
        <div className="space-y-1.5 px-3 pb-2" style={{ fontSize: "0.85em" }}>
          {reversed.map((it) => (
            <div
              key={it.partId}
              className={`rounded border ${t.sidebarItemBorder} ${t.userBubble} px-2 py-1.5`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded ${t.connectedOn} px-1.5 py-0.5`}
                  style={{ fontSize: "0.75em" }}
                >
                  from {it.meta.from} · hop {it.meta.hop}
                </span>
                <span className={t.mutedText} style={{ fontSize: "0.75em" }}>
                  rope {it.meta.rope.slice(0, 8)}…
                </span>
              </div>
              <div className={`whitespace-pre-wrap break-words ${t.rootText}`}>
                {it.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
