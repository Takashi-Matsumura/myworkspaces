import type { ReactNode } from "react";
import { CodeXml, TerminalSquare } from "lucide-react";
import type { TerminalVariant } from "../components/floating-terminal";
import type { TerminalPanelId } from "../types/panels";

export type TerminalPanelDefinition = {
  id: TerminalPanelId;
  variant: TerminalVariant;
  slot: "left" | "center" | "right";
  switcherLabel: string;
  switcherTitle: string;
  switcherAccent: string;
  switcherIcon: ReactNode;
};

// 新しいターミナル種別を増やす時はここに 1 行追加するだけで
// <FloatingTerminal> と <PanelSwitcherButton> の両方が自動で生える。
export const TERMINAL_PANEL_DEFINITIONS: readonly TerminalPanelDefinition[] = [
  {
    id: "coding",
    variant: "coding",
    slot: "left",
    switcherLabel: "Coding",
    switcherTitle: "Coding パネルを最前面に",
    switcherAccent: "#15151c",
    switcherIcon: <CodeXml className="h-3 w-3" />,
  },
  {
    id: "business",
    variant: "business",
    slot: "right",
    switcherLabel: "Business",
    switcherTitle: "Business パネルを最前面に",
    switcherAccent: "#217346",
    switcherIcon: <CodeXml className="h-3 w-3" />,
  },
  {
    id: "ubuntu",
    variant: "ubuntu",
    slot: "center",
    switcherLabel: "Shell",
    switcherTitle: "Shell パネル (ubuntu / bash) を最前面に",
    switcherAccent: "#4f46e5",
    switcherIcon: <TerminalSquare className="h-3 w-3" />,
  },
];
