// OpencodeChat を Business (白ベース) / Coding (黒ベース) で共用するためのテーマ定義。
// ハードコード色を一か所にまとめ、variant で差し替える。

export type ChatVariant = "business" | "coding" | "analyze";

export type ChatTheme = {
  // root
  rootBg: string;
  rootText: string;
  rootExtra: string; // root 追加クラス (例: dark 用の chat-dark スコープ)

  // header
  headerBg: string;
  headerBorder: string;
  iconBtn: string;
  brandOpen: string; // "open" 文字の色
  brandCode: string; // "code" 文字の色
  mutedText: string;
  connectedOn: string;
  connectedOff: string;
  configCwdText: string;
  configLabelText: string;
  configModelText: string;
  errorText: string;

  // sidebar (SessionList)
  sidebarBg: string;
  sidebarBorder: string;
  newBtn: string;
  sidebarEmpty: string;
  sidebarItemBorder: string;
  sidebarActive: string;
  sidebarHover: string;
  sidebarMutedSub: string; // 2 行目 (directory など)
  sidebarMutedMini: string; // 状態表示 (● 応答中など)
  sidebarDangerBtn: string; // ホバー時削除ボタン

  // chat thread / empty
  emptyText: string;

  // message bubbles
  userBubble: string;
  assistantBubble: string;
  bubbleLabel: string;
  assistantAccent: string;

  // markdown prose
  proseExtra: string; // "" | "prose-invert"

  // reasoning (思考ログ)
  reasoningBorder: string; // details の border + bg
  reasoningSummary: string; // summary (hover 含む)
  reasoningTabActive: string; // "原文" タブ active
  reasoningTabInactive: string; // "原文" タブ非active
  translateTabActive: string; // "日本語" タブ active
  translateTabInactive: string; // "日本語" タブ非active
  reasoningBodyText: string;
  translatedText: string;
  translatingText: string;
  translationCaretAccent: string;
  retranslateBtn: string;

  // composer
  composerWrap: string; // 外枠 (border + bg + focus-within)
  suggestWrap: string;
  suggestHeader: string;
  suggestActive: string;
  suggestHover: string;
  suggestName: string;
  suggestDesc: string;
  composerLabel: string;
  composerTextarea: string; // placeholder + disabled
  composerFooter: string;
  composerBusyOn: string;
  composerBusyOff: string;
  abortBtn: string;
  sendBtn: string;
};

export const CHAT_THEMES: Record<ChatVariant, ChatTheme> = {
  business: {
    rootBg: "bg-white",
    rootText: "text-gray-900",
    rootExtra: "",

    headerBg: "bg-gray-50",
    headerBorder: "border-gray-200",
    iconBtn: "text-gray-500 hover:bg-gray-200",
    brandOpen: "text-slate-400",
    brandCode: "text-slate-900",
    mutedText: "text-gray-400",
    connectedOn: "bg-emerald-100 text-emerald-700",
    connectedOff: "bg-gray-200 text-gray-600",
    configCwdText: "text-gray-600",
    configLabelText: "text-gray-400",
    configModelText: "text-gray-800",
    errorText: "text-red-600",

    sidebarBg: "bg-gray-50",
    sidebarBorder: "border-gray-200",
    newBtn:
      "border-b border-gray-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
    sidebarEmpty: "text-gray-400",
    sidebarItemBorder: "border-gray-100",
    sidebarActive: "bg-emerald-100",
    sidebarHover: "hover:bg-white",
    sidebarMutedSub: "text-gray-500",
    sidebarMutedMini: "text-gray-400",
    sidebarDangerBtn: "text-gray-400 hover:text-red-600",

    emptyText: "text-gray-500",

    userBubble: "bg-gray-100",
    assistantBubble: "border border-emerald-200 bg-emerald-50/40",
    bubbleLabel: "text-gray-500",
    assistantAccent: "text-emerald-700",

    proseExtra: "",

    reasoningBorder: "border border-gray-200 bg-white/70",
    reasoningSummary: "text-gray-500 hover:bg-gray-100",
    reasoningTabActive: "bg-gray-200 text-gray-800",
    reasoningTabInactive: "text-gray-500 hover:bg-gray-100",
    translateTabActive: "bg-emerald-100 text-emerald-800",
    translateTabInactive: "text-emerald-700 hover:bg-emerald-50",
    reasoningBodyText: "text-gray-700",
    translatedText: "text-gray-800",
    translatingText: "text-gray-500",
    translationCaretAccent: "text-emerald-600",
    retranslateBtn: "bg-emerald-600 hover:bg-emerald-500 text-white",

    composerWrap:
      "border border-emerald-300/60 bg-white focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-200",
    suggestWrap: "border border-gray-200 bg-white",
    suggestHeader: "border-b border-gray-100 bg-gray-50 text-gray-500",
    suggestActive: "bg-emerald-50",
    suggestHover: "hover:bg-gray-50",
    suggestName: "text-emerald-700",
    suggestDesc: "text-gray-500",
    composerLabel: "text-emerald-700",
    composerTextarea:
      "placeholder:text-gray-400 disabled:bg-transparent disabled:text-gray-400",
    composerFooter: "border-t border-gray-100",
    composerBusyOn: "text-emerald-700",
    composerBusyOff: "text-gray-500",
    abortBtn: "bg-red-600 hover:bg-red-500 text-white",
    sendBtn:
      "bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-gray-300",
  },

  coding: {
    rootBg: "bg-[#0b0b0f]",
    rootText: "text-white/90",
    rootExtra: "chat-dark",

    headerBg: "bg-[#15151c]",
    headerBorder: "border-white/10",
    iconBtn: "text-white/60 hover:bg-white/10 hover:text-white/90",
    brandOpen: "text-white/40",
    brandCode: "text-white",
    mutedText: "text-white/40",
    connectedOn: "bg-emerald-500/20 text-emerald-300",
    connectedOff: "bg-white/10 text-white/60",
    configCwdText: "text-white/60",
    configLabelText: "text-white/40",
    configModelText: "text-white/90",
    errorText: "text-red-400",

    sidebarBg: "bg-[#15151c]",
    sidebarBorder: "border-white/10",
    newBtn:
      "border-b border-white/10 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25",
    sidebarEmpty: "text-white/40",
    sidebarItemBorder: "border-white/10",
    sidebarActive: "bg-emerald-500/20",
    sidebarHover: "hover:bg-white/5",
    sidebarMutedSub: "text-white/50",
    sidebarMutedMini: "text-white/40",
    sidebarDangerBtn: "text-white/40 hover:text-red-400",

    emptyText: "text-white/50",

    userBubble: "bg-white/5",
    assistantBubble: "border border-emerald-500/30 bg-emerald-500/10",
    bubbleLabel: "text-white/50",
    assistantAccent: "text-emerald-300",

    proseExtra: "prose-invert",

    reasoningBorder: "border border-white/10 bg-white/5",
    reasoningSummary: "text-white/60 hover:bg-white/5",
    reasoningTabActive: "bg-white/15 text-white/90",
    reasoningTabInactive: "text-white/60 hover:bg-white/10",
    translateTabActive: "bg-emerald-500/20 text-emerald-200",
    translateTabInactive: "text-emerald-300 hover:bg-emerald-500/10",
    reasoningBodyText: "text-white/70",
    translatedText: "text-white/80",
    translatingText: "text-white/60",
    translationCaretAccent: "text-emerald-400",
    retranslateBtn: "bg-emerald-600 hover:bg-emerald-500 text-white",

    composerWrap:
      "border border-emerald-500/40 bg-[#15151c] focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-500/30",
    suggestWrap: "border border-white/10 bg-[#0b0b0f]",
    suggestHeader: "border-b border-white/10 bg-[#15151c] text-white/60",
    suggestActive: "bg-emerald-500/15",
    suggestHover: "hover:bg-white/5",
    suggestName: "text-emerald-300",
    suggestDesc: "text-white/50",
    composerLabel: "text-emerald-300",
    composerTextarea:
      "placeholder:text-white/30 disabled:bg-transparent disabled:text-white/30",
    composerFooter: "border-t border-white/10",
    composerBusyOn: "text-emerald-300",
    composerBusyOff: "text-white/60",
    abortBtn: "bg-red-600 hover:bg-red-500 text-white",
    sendBtn:
      "bg-emerald-600 hover:bg-emerald-500 text-white disabled:bg-white/10 disabled:text-white/40",
  },

  // Analyze パネル: 既存ソース分析 + 設計資料 (Markdown) 生成。
  // coding をベースに emerald → violet (#7c3aed 系) に置換し、Coding/Business と
  // 色相が完全に分かれるようにする。
  analyze: {
    rootBg: "bg-[#100c1f]",
    rootText: "text-white/90",
    rootExtra: "chat-dark",

    headerBg: "bg-[#1a1530]",
    headerBorder: "border-white/10",
    iconBtn: "text-white/60 hover:bg-white/10 hover:text-white/90",
    brandOpen: "text-white/40",
    brandCode: "text-white",
    mutedText: "text-white/40",
    connectedOn: "bg-violet-500/20 text-violet-300",
    connectedOff: "bg-white/10 text-white/60",
    configCwdText: "text-white/60",
    configLabelText: "text-white/40",
    configModelText: "text-white/90",
    errorText: "text-red-400",

    sidebarBg: "bg-[#1a1530]",
    sidebarBorder: "border-white/10",
    newBtn:
      "border-b border-white/10 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25",
    sidebarEmpty: "text-white/40",
    sidebarItemBorder: "border-white/10",
    sidebarActive: "bg-violet-500/20",
    sidebarHover: "hover:bg-white/5",
    sidebarMutedSub: "text-white/50",
    sidebarMutedMini: "text-white/40",
    sidebarDangerBtn: "text-white/40 hover:text-red-400",

    emptyText: "text-white/50",

    userBubble: "bg-white/5",
    assistantBubble: "border border-violet-500/30 bg-violet-500/10",
    bubbleLabel: "text-white/50",
    assistantAccent: "text-violet-300",

    proseExtra: "prose-invert",

    reasoningBorder: "border border-white/10 bg-white/5",
    reasoningSummary: "text-white/60 hover:bg-white/5",
    reasoningTabActive: "bg-white/15 text-white/90",
    reasoningTabInactive: "text-white/60 hover:bg-white/10",
    translateTabActive: "bg-violet-500/20 text-violet-200",
    translateTabInactive: "text-violet-300 hover:bg-violet-500/10",
    reasoningBodyText: "text-white/70",
    translatedText: "text-white/80",
    translatingText: "text-white/60",
    translationCaretAccent: "text-violet-400",
    retranslateBtn: "bg-violet-600 hover:bg-violet-500 text-white",

    composerWrap:
      "border border-violet-500/40 bg-[#1a1530] focus-within:border-violet-400 focus-within:ring-1 focus-within:ring-violet-500/30",
    suggestWrap: "border border-white/10 bg-[#100c1f]",
    suggestHeader: "border-b border-white/10 bg-[#1a1530] text-white/60",
    suggestActive: "bg-violet-500/15",
    suggestHover: "hover:bg-white/5",
    suggestName: "text-violet-300",
    suggestDesc: "text-white/50",
    composerLabel: "text-violet-300",
    composerTextarea:
      "placeholder:text-white/30 disabled:bg-transparent disabled:text-white/30",
    composerFooter: "border-t border-white/10",
    composerBusyOn: "text-violet-300",
    composerBusyOff: "text-white/60",
    abortBtn: "bg-red-600 hover:bg-red-500 text-white",
    sendBtn:
      "bg-violet-600 hover:bg-violet-500 text-white disabled:bg-white/10 disabled:text-white/40",
  },
};
