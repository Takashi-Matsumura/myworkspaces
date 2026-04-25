"use client";

import { Maximize2, Settings } from "lucide-react";
import type { usePointerDrag } from "../hooks/use-pointer-drag";
import { useWorkspace } from "./workspace-context";
import type { ContainerInfo } from "./floating-workspace";

type Props = {
  containerInfo: ContainerInfo | null;
  fontSize: number;
  changeFontSize: (delta: number) => void;
  scenePos: { x: number; y: number };
  sceneSize: { w: number; h: number };
  onZoomToFit?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onFlipToSettings: () => void;
  headerHandlers: ReturnType<typeof usePointerDrag>;
};

export function FloatingWorkspaceHeader({
  containerInfo,
  fontSize,
  changeFontSize,
  scenePos,
  sceneSize,
  onZoomToFit,
  onFlipToSettings,
  headerHandlers,
}: Props) {
  const { workspace } = useWorkspace();
  return (
    <div
      className="flex h-9 cursor-grab items-center justify-between gap-2 rounded-t-lg border-b border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 active:cursor-grabbing select-none"
      {...headerHandlers}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onZoomToFit?.({ x: scenePos.x, y: scenePos.y, w: sceneSize.w, h: sceneSize.h });
          }}
          className="group h-3 w-3 rounded-full bg-[#28c840] hover:brightness-110"
          title="80% フィット表示"
        >
          <Maximize2 className="hidden h-2.5 w-2.5 stroke-[3] text-black/60 group-hover:block" style={{ margin: "0.5px" }} />
        </button>
        <span className="font-mono font-medium text-slate-700">workspaces</span>
        {containerInfo?.id && (
          <span
            className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
            title={`Docker container ID (${containerInfo.running ? "running" : "stopped"})`}
          >
            {containerInfo.id}
          </span>
        )}
        {containerInfo?.isolated && (
          <span
            className="rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] text-emerald-700"
            title={`network: ${containerInfo.networkMode ?? "isolated"} (外部インターネット遮断)`}
          >
            🔒 隔離中
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="truncate font-mono text-[10px] text-slate-400">
          {workspace?.cwd ?? "(no workspace open)"}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              changeFontSize(-1);
            }}
            className="rounded px-1 text-[10px] text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            title="文字サイズを下げる"
          >
            A-
          </button>
          <span className="min-w-[1.5rem] text-center font-mono text-[10px] text-slate-500">{fontSize}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              changeFontSize(1);
            }}
            className="rounded px-1 text-[10px] text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            title="文字サイズを上げる"
          >
            A+
          </button>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFlipToSettings();
          }}
          className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
          title="設定"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
