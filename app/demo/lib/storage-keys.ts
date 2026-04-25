import type { TerminalPanelId } from "../types/panels";

export const STORAGE_KEYS = {
  workspaceFontSize: "workspace-fontSize",
  workspaceShowHidden: "workspace-showHidden",
} as const;

export const terminalFontSizeKey = (variant: TerminalPanelId): string =>
  `terminal-fontSize-${variant}`;
