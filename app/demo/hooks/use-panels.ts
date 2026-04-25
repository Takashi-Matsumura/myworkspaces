"use client";

import { useCallback, useReducer } from "react";
import {
  INITIAL_PANEL_ORDER,
  type PanelId,
  type TerminalPanelId,
} from "../types/panels";
import type { TerminalSession } from "../components/floating-terminal";
import type { Workspace } from "../components/floating-workspace";

export type PanelsState = {
  // Map にすることで 3 つの useState を 1 ヶ所に集約。
  // reducer は破壊的更新せず、必ず new Map(state.sessions) でクローンする。
  sessions: Map<TerminalPanelId, TerminalSession>;
  order: PanelId[]; // 末尾 = 最前面
};

export type PanelsAction =
  | {
      type: "open_terminal";
      id: TerminalPanelId;
      workspace: Workspace;
      // Date.now() を呼び出し側で生成して渡すことで reducer を pure に保つ。
      nonce: number;
    }
  | { type: "close_terminal"; id: TerminalPanelId }
  | { type: "bring_to_front"; id: PanelId }
  | { type: "clear_terminal_sessions" };

const INITIAL_STATE: PanelsState = {
  sessions: new Map(),
  order: [...INITIAL_PANEL_ORDER],
};

function moveToFront(order: PanelId[], id: PanelId): PanelId[] {
  if (order[order.length - 1] === id) return order;
  return [...order.filter((p) => p !== id), id];
}

export function panelsReducer(state: PanelsState, action: PanelsAction): PanelsState {
  switch (action.type) {
    case "open_terminal": {
      const sessions = new Map(state.sessions);
      sessions.set(action.id, {
        workspaceId: action.workspace.id,
        cwd: action.workspace.cwd,
        nonce: action.nonce,
      });
      return { sessions, order: moveToFront(state.order, action.id) };
    }
    case "close_terminal": {
      if (!state.sessions.has(action.id)) return state;
      const sessions = new Map(state.sessions);
      sessions.delete(action.id);
      return { ...state, sessions };
    }
    case "bring_to_front": {
      const next = moveToFront(state.order, action.id);
      if (next === state.order) return state;
      return { ...state, order: next };
    }
    case "clear_terminal_sessions": {
      if (state.sessions.size === 0) return state;
      return { ...state, sessions: new Map() };
    }
    default: {
      // 網羅性チェック
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function usePanels(): {
  sessions: ReadonlyMap<TerminalPanelId, TerminalSession>;
  order: readonly PanelId[];
  frontPanel: PanelId;
  zFor: (id: PanelId) => number;
  openTerminal: (id: TerminalPanelId, workspace: Workspace) => void;
  closeTerminal: (id: TerminalPanelId) => void;
  bringToFront: (id: PanelId) => void;
  clearTerminalSessions: () => void;
} {
  const [state, dispatch] = useReducer(panelsReducer, INITIAL_STATE);

  const openTerminal = useCallback((id: TerminalPanelId, workspace: Workspace) => {
    dispatch({ type: "open_terminal", id, workspace, nonce: Date.now() });
  }, []);

  const closeTerminal = useCallback((id: TerminalPanelId) => {
    dispatch({ type: "close_terminal", id });
  }, []);

  const bringToFront = useCallback((id: PanelId) => {
    dispatch({ type: "bring_to_front", id });
  }, []);

  const clearTerminalSessions = useCallback(() => {
    dispatch({ type: "clear_terminal_sessions" });
  }, []);

  // zIndex は 40 起点、末尾ほど手前。footer (z-[60]) より下に収める。
  const zFor = useCallback(
    (id: PanelId): number => 40 + state.order.indexOf(id),
    [state.order],
  );

  const frontPanel = state.order[state.order.length - 1];

  return {
    sessions: state.sessions,
    order: state.order,
    frontPanel,
    zFor,
    openTerminal,
    closeTerminal,
    bringToFront,
    clearTerminalSessions,
  };
}
