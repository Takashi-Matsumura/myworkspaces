"use client";

import { useState } from "react";
import { FileText, Wand2 } from "lucide-react";
import dynamic from "next/dynamic";

// 裏面の中身は ssr:false で遅延ロードする。xterm / ファイル API を参照する
// ため SSR 文脈では評価できない。
const RagDocuments = dynamic(() => import("./rag-documents"), { ssr: false });
const OpencodeSkills = dynamic(() => import("./opencode-skills"), {
  ssr: false,
});

type Tab = "rag" | "skills";

// Business パネル裏面のタブ切替ラッパー。
// - rag: 既存の RAG ドキュメント管理
// - skills: ユーザー全体スキル (SKILL.md) の編集
export default function BusinessBackPanel({
  fontSize = 13,
}: {
  fontSize?: number;
}) {
  const [tab, setTab] = useState<Tab>("rag");

  return (
    <div className="flex h-full w-full flex-col bg-white">
      <div
        className="flex items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-1"
        style={{ fontSize: `${Math.max(11, Math.round(fontSize * 0.85))}px` }}
      >
        <TabButton
          active={tab === "rag"}
          onClick={() => setTab("rag")}
          icon={<FileText style={{ width: "1em", height: "1em" }} />}
          label="RAG ドキュメント"
        />
        <TabButton
          active={tab === "skills"}
          onClick={() => setTab("skills")}
          icon={<Wand2 style={{ width: "1em", height: "1em" }} />}
          label="スキル"
        />
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === "rag" ? (
          <RagDocuments fontSize={fontSize} />
        ) : (
          <OpencodeSkills fontSize={fontSize} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-3 py-1 font-medium transition-colors ${
        active
          ? "bg-white text-emerald-700 shadow-sm"
          : "text-gray-500 hover:bg-white hover:text-gray-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
