export type PanelId = "workspace" | "coding" | "business" | "ubuntu" | "analyze";
export type TerminalPanelId = Exclude<PanelId, "workspace">;

export const TERMINAL_PANEL_IDS: readonly TerminalPanelId[] = [
  "coding",
  "business",
  "ubuntu",
  "analyze",
];

// 末尾ほど手前。起動直後はターミナル系を Workspace より上に置く。
export const INITIAL_PANEL_ORDER: readonly PanelId[] = [
  "workspace",
  "ubuntu",
  "business",
  "analyze",
  "coding",
];
