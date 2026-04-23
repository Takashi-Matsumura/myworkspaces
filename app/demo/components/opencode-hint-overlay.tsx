"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { TerminalVariant } from "./floating-terminal";

// localStorage 側のキー。variant ごとに独立させ、Coding / Business のどちらかを
// 閉じても他方は初回ガイドを出す。
const STORAGE_KEY_PREFIX = "opencode-hint-dismissed:";

function storageKey(variant: TerminalVariant): string {
  return `${STORAGE_KEY_PREFIX}${variant}`;
}

type HintRow = { keys: string[]; label: string };

const COMMON_HINTS: HintRow[] = [
  { keys: ["Enter"], label: "質問を送信" },
  { keys: ["Shift", "Enter"], label: "改行を追加" },
  { keys: ["Tab"], label: "Build（実装）／ Plan（計画）を切替" },
  { keys: ["Ctrl", "P"], label: "コマンド一覧を表示" },
  { keys: ["/help"], label: "ヘルプを表示（入力欄に打つ）" },
];

// floating-terminal.tsx の VARIANT_STYLES と色味を揃えるためのテーマ定義。
// Coding: 黒パネル + Emerald アクセント。Business: Excel グリーン。
type Theme = {
  backdrop: string; // 暗幕色
  card: string;     // カード classes
  kbd: string;      // キーキャップ classes
  heading: string;  // 見出し色
  text: string;     // 本文色
  muted: string;    // 補足テキスト色
  closeBtn: string; // ×ボタン classes
  secondaryBtn: string; // 「今回だけ閉じる」
  primaryBtn: string;   // 「今後表示しない」
};

const THEMES: Record<Exclude<TerminalVariant, "ubuntu">, Theme> = {
  coding: {
    backdrop: "rgba(0,0,0,0.55)",
    card: "border border-emerald-500/30 bg-[#15151c]",
    kbd: "border-emerald-400/30 bg-emerald-500/10 text-white",
    heading: "text-white",
    text: "text-white/90",
    muted: "text-white/60",
    closeBtn: "text-white/60 hover:bg-white/10 hover:text-white",
    secondaryBtn: "border border-white/20 text-white/80 hover:bg-white/10",
    primaryBtn:
      "bg-emerald-500 text-black hover:bg-emerald-400 font-medium",
  },
  business: {
    backdrop: "rgba(12,60,35,0.55)",
    card: "border border-[#b7d9b7] bg-[#1b5e3a]",
    kbd: "border-white/25 bg-white/10 text-white",
    heading: "text-white",
    text: "text-white/95",
    muted: "text-white/70",
    closeBtn: "text-white/70 hover:bg-white/15 hover:text-white",
    secondaryBtn: "border border-white/30 text-white hover:bg-white/10",
    primaryBtn:
      "bg-white text-[#1b5e3a] hover:bg-white/90 font-medium",
  },
};

export default function OpencodeHintOverlay({
  variant,
}: {
  variant: TerminalVariant;
}) {
  // 初期値は「隠す」にしておき、マウント後に localStorage を見て出し分ける。
  // こうしないと SSR / CSR 間で class が食い違う可能性がある。
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(storageKey(variant)) === "1";
      if (!dismissed) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [variant]);

  // ubuntu variant は呼び出し側で弾いているが、型の都合上ここでも防衛。
  if (!visible || variant === "ubuntu") return null;

  const theme = THEMES[variant];

  const dismiss = (persist: boolean) => {
    if (persist) {
      try {
        localStorage.setItem(storageKey(variant), "1");
      } catch {}
    }
    setVisible(false);
  };

  const heading =
    variant === "business"
      ? "Business パネル（Excel・CSV 対応）の使い方"
      : "Coding パネル（opencode）の使い方";

  return (
    <div
      // ヘッダー (h-9 = 36px) の下を覆う暗幕。Business パネルの CSS filter を
      // 受けないよう、呼び出し側では filter 非適用の親 div に配置すること。
      className="absolute inset-x-0 bottom-0 top-9 z-10 flex items-center justify-center rounded-b-lg px-6"
      style={{ backgroundColor: theme.backdrop }}
      // クリックスルー防止（裏の xterm にフォーカスが当たらないように）
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className={`max-w-sm rounded-lg p-4 text-left font-sans shadow-2xl ${theme.card}`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className={`text-sm font-semibold ${theme.heading}`}>{heading}</h3>
          <button
            type="button"
            onClick={() => dismiss(false)}
            className={`rounded p-1 ${theme.closeBtn}`}
            title="閉じる"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className={`space-y-1.5 text-xs ${theme.text}`}>
          {COMMON_HINTS.map((h) => (
            <li key={h.label} className="flex items-center gap-2">
              <span className="flex flex-none items-center gap-1">
                {h.keys.map((k, i) => (
                  <kbd
                    key={`${h.label}-${i}`}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${theme.kbd}`}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span>{h.label}</span>
            </li>
          ))}
        </ul>

        <p className={`mt-3 text-[11px] leading-relaxed ${theme.muted}`}>
          画面の英語表記はそのままですが、応答は日本語で返ってきます。
          {variant === "business" && "Excel や CSV は「○○.xlsx を要約して」のように日本語でお尋ねください。"}
        </p>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => dismiss(false)}
            className={`rounded px-2.5 py-1 text-[11px] ${theme.secondaryBtn}`}
          >
            今回だけ閉じる
          </button>
          <button
            type="button"
            onClick={() => dismiss(true)}
            className={`rounded px-2.5 py-1 text-[11px] ${theme.primaryBtn}`}
          >
            今後表示しない
          </button>
        </div>
      </div>
    </div>
  );
}
