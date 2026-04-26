// Analyze パネル (AnalysisConsole) 専用の色トークン。
// CODING_THEME (coding-theme.ts) と同じ構造で、accent を emerald/sky → violet 系に
// 寄せている。Coding と並列に表示しても色相で区別できることが目的。

export const ANALYSIS_THEME = {
  // tool / step のカード枠
  cardBg: "bg-[#15102a]",
  cardBorder: "border-white/10",
  cardSummaryBg: "bg-white/[0.02]",
  cardSummaryHover: "hover:bg-white/[0.04]",

  // カードのアクセントカラー (左端のバー / アイコン色)
  cardAccentRead: "text-violet-300",
  cardAccentEdit: "text-amber-400",
  cardAccentRun: "text-sky-400",
  cardAccentWrite: "text-violet-200",
  cardAccentMisc: "text-white/50",

  // step-start / step-finish のセパレータ
  stepSeparator: "text-white/40",

  // code-block.tsx の prism ラッパ
  codeBlockBg: "bg-[#100c1f]",
  codeBlockBorder: "border-white/10",

  // ヘッダー右端のミニ統計バッジ
  headerStatBadge: "bg-white/5 text-white/70 border border-white/10",

  // セッションドロワー (SessionList 本体は chat-theme.analyze を再利用)
  drawerBg: "bg-[#1a1530]",
  drawerShadow: "shadow-2xl shadow-black/40",
} as const;

export type AnalysisTheme = typeof ANALYSIS_THEME;
