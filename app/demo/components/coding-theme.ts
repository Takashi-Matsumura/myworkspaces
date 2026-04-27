// Coding パネル (CodingConsole) 専用の色トークン。
// OpencodeChat で共用している chat-theme.ts には tool カード / code block /
// step セパレータなど Coding 固有の装飾が入らないよう、ここに独立定義する。

export const CODING_THEME = {
  // tool / step のカード枠
  cardBg: "bg-[#12121a]",
  cardBorder: "border-white/10",
  cardSummaryBg: "bg-white/[0.02]",
  cardSummaryHover: "hover:bg-white/[0.04]",

  // カードのアクセントカラー (左端のバー / アイコン色)
  cardAccentRead: "text-emerald-400",
  cardAccentEdit: "text-amber-400",
  cardAccentRun: "text-sky-400",
  cardAccentWrite: "text-emerald-300",
  cardAccentMisc: "text-white/80",

  // step-start / step-finish のセパレータ
  stepSeparator: "text-white/70",

  // code-block.tsx の prism ラッパ
  codeBlockBg: "bg-[#0b0b0f]",
  codeBlockBorder: "border-white/10",

  // セッションドロワー (SessionList 本体は chat-theme.coding を再利用)
  drawerBg: "bg-[#15151c]",
  drawerShadow: "shadow-2xl shadow-black/40",
} as const;

export type CodingTheme = typeof CODING_THEME;
