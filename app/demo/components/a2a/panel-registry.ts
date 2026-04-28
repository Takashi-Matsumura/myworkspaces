// Phase 3: A2A 関連の panel 状態と D&D 状態の型定義。
// app/page.tsx が state を持ち、FloatingTerminal / RopeLayer 両方に渡す。

import type { A2APanel } from "@/lib/a2a/prefix";

// パネルのシーン座標 (Excalidraw 座標系)。
// 画面座標は (x + view.x) * view.zoom で得る。
export type PanelGeo = {
  x: number;
  y: number;
  w: number;
  h: number;
};

// 各 panel が登録する状態。
// activeSessionId は console 内の useState から、geo は FloatingTerminal の scenePos/sceneSize から由来。
export type A2APanelState = {
  geo: PanelGeo | null;
  activeSessionId: string | null;
};

// app/page.tsx が hold する全パネル分の状態。
export type A2APanelStates = Record<A2APanel, A2APanelState>;

export const EMPTY_A2A_PANEL_STATES: A2APanelStates = {
  biz: { geo: null, activeSessionId: null },
  code: { geo: null, activeSessionId: null },
};

// アンカードラッグ中の状態。app/page.tsx が hold して、RopeLayer が読む。
export type A2ADragState = {
  fromKind: A2APanel;
  // ドラッグ開始時のアンカー画面座標 (CSS px)
  fromX: number;
  fromY: number;
  // 現在のマウス位置 (CSS px)
  mouseX: number;
  mouseY: number;
};
