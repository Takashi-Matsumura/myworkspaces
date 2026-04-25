"use client";

import { Plus, Trash2 } from "lucide-react";
import type { SessionInfo } from "../use-opencode-stream";
import type { ChatTheme } from "../chat-theme";

export function SessionList({
  sessions,
  activeId,
  busyMap,
  onSelect,
  onNew,
  onDelete,
  theme,
}: {
  sessions: SessionInfo[];
  activeId: string | null;
  busyMap: Record<string, boolean>;
  onSelect: (id: string) => void;
  onNew: () => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  theme: ChatTheme;
}) {
  return (
    <aside
      className={`flex w-48 flex-none flex-col border-r ${theme.sidebarBorder} ${theme.sidebarBg}`}
      style={{ fontSize: "0.85em" }}
    >
      <button
        type="button"
        onClick={() => void onNew()}
        className={`flex items-center justify-center gap-1 py-2 font-medium ${theme.newBtn}`}
      >
        <Plus style={{ width: "1.1em", height: "1.1em" }} />
        新規セッション
      </button>
      <ul className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <li className={`px-3 py-4 ${theme.sidebarEmpty}`}>
            セッションはありません
          </li>
        ) : (
          sessions.map((s) => {
            const busy = busyMap[s.id];
            const active = s.id === activeId;
            return (
              <li
                key={s.id}
                className={`group flex items-center gap-1 border-b ${theme.sidebarItemBorder} px-2 py-1.5 ${
                  active ? theme.sidebarActive : theme.sidebarHover
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
                    className={`truncate ${theme.sidebarMutedSub}`}
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
                    className={theme.sidebarDangerBtn}
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
