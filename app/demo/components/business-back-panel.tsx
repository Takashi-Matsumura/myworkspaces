"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MessageSquare, FileText } from "lucide-react";

const OpencodeChat = dynamic(() => import("./opencode-chat"), { ssr: false });
const RagDocuments = dynamic(() => import("./rag-documents"), { ssr: false });

// Business パネルの裏面。チャット (新 UI) と RAG ドキュメントをタブ切替で持つ。
// 裏面 = 白ベース (Business の filter を避けるため floating-terminal 側で
// filter 適用外の位置に配置されている)。
type Tab = "chat" | "rag";

const TABS: { id: Tab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "チャット", icon: MessageSquare },
  { id: "rag", label: "RAG ドキュメント", icon: FileText },
];

export default function BusinessBackPanel() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <nav className="flex items-stretch border-b border-gray-200 bg-gray-50 text-xs">
        {TABS.map((t) => {
          const active = t.id === tab;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border-r border-gray-200 px-3 py-2 ${
                active
                  ? "bg-white font-semibold text-emerald-700"
                  : "text-gray-600 hover:bg-white"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 overflow-hidden">
        {tab === "chat" ? <OpencodeChat /> : <RagDocuments />}
      </div>
    </div>
  );
}
