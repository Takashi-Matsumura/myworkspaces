"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Workspace } from "./floating-workspace";

type WorkspaceContextValue = {
  workspace: Workspace | null;
  onWorkspaceChange: (ws: Workspace | null) => void;
  notice: string | null;
  setNotice: (msg: string | null) => void;
  error: string | null;
  setError: (msg: string | null) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceContextProvider({
  workspace,
  onWorkspaceChange,
  children,
}: {
  workspace: Workspace | null;
  onWorkspaceChange: (ws: Workspace | null) => void;
  children: ReactNode;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 通知の自動消去 (3.5 秒)
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <WorkspaceContext.Provider
      value={{ workspace, onWorkspaceChange, notice, setNotice, error, setError }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceContextProvider");
  return ctx;
}
