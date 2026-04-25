"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Settings, ArrowLeft } from "lucide-react";
import type { View } from "./whiteboard-canvas";
import SettingsPanel from "./settings-panel";
import { usePointerDrag } from "../hooks/use-pointer-drag";
import { usePointerResize } from "../hooks/use-pointer-resize";
import { useFontSize } from "../hooks/use-font-size";
import { use3dFlip } from "../hooks/use-3d-flip";
import { useLocalStorageBoolean } from "../hooks/use-local-storage-boolean";
import { STORAGE_KEYS } from "../lib/storage-keys";
import {
  apiActivateOpencode,
  apiTouchWorkspace,
  type WorkspaceListEntry,
} from "../api/workspace";
import { WorkspaceContextProvider, useWorkspace } from "./workspace-context";
import { FloatingWorkspaceHeader } from "./floating-workspace-header";
import { FloatingWorkspaceSelector } from "./floating-workspace-selector";
import { FloatingWorkspaceTree } from "./floating-workspace-tree";
import { FloatingWorkspacePreview } from "./floating-workspace-preview";

export type ContainerInfo = {
  exists: boolean;
  running: boolean;
  id?: string;
  networkMode?: string;
  isolated?: boolean;
};

type ScenePos = { x: number; y: number };
type SceneSize = { w: number; h: number };

export type Workspace = {
  id: string;
  label: string;
  cwd: string; // /root/workspaces/{id}
  createdAt: number;
  lastOpenedAt: number;
};

function workspaceToFull(e: WorkspaceListEntry): Workspace {
  return { ...e, cwd: `/root/workspaces/${e.id}` };
}

type FloatingWorkspaceProps = {
  view: View;
  workspace: Workspace | null;
  onWorkspaceChange: (ws: Workspace | null) => void;
  onStartCoding: () => void;
  onStartBusiness: () => void;
  onStartUbuntu: () => void;
  onZoomToFit?: (rect: { x: number; y: number; w: number; h: number }) => void;
  onResetContainer: () => Promise<boolean>;
  z: number;
  onFocus?: () => void;
};

export default function FloatingWorkspace(props: FloatingWorkspaceProps) {
  return (
    <WorkspaceContextProvider
      workspace={props.workspace}
      onWorkspaceChange={props.onWorkspaceChange}
    >
      <FloatingWorkspaceInner {...props} />
    </WorkspaceContextProvider>
  );
}

function FloatingWorkspaceInner({
  view,
  onStartCoding,
  onStartBusiness,
  onStartUbuntu,
  onZoomToFit,
  onResetContainer,
  z,
  onFocus,
}: FloatingWorkspaceProps) {
  const { workspace, onWorkspaceChange, notice, error } = useWorkspace();
  const { flipped, setFlipped } = use3dFlip(false);
  // 初期位置は window 参照が必要だが、SSR 時は window が無いので lazy initializer の中で分岐。
  const [scenePos, setScenePos] = useState<ScenePos>(() => {
    if (typeof window === "undefined") return { x: 60, y: 60 };
    return {
      x: Math.max(0, (window.innerWidth - 640) / 2),
      y: Math.max(0, (window.innerHeight - 460) / 2),
    };
  });
  const [sceneSize, setSceneSize] = useState<SceneSize>({ w: 640, h: 460 });

  const [splitPct, setSplitPct] = useState(45);
  const { fontSize, changeFontSize } = useFontSize(STORAGE_KEYS.workspaceFontSize, {
    default: 12,
    min: 10,
    max: 20,
  });
  const { value: showHidden, toggle: toggleShowHidden } = useLocalStorageBoolean(
    STORAGE_KEYS.workspaceShowHidden,
    false,
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [containerInfo, setContainerInfo] = useState<ContainerInfo | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshSignal((s) => s + 1), []);

  const refetchContainer = useCallback(async () => {
    try {
      const res = await fetch("/api/container", { cache: "no-store" });
      if (res.ok) setContainerInfo((await res.json()) as ContainerInfo);
    } catch {
      // noop: ヘッダバッジが出ないだけなので握り潰す
    }
  }, []);

  // 初回 + コンテナが存在しない間は数秒おきにポーリング (ターミナル起動やリセット後に自動で反映される)。
  // 一度 id を掴んだら止まる。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refetchContainer(); }, [refetchContainer]);
  useEffect(() => {
    if (containerInfo?.id) return;
    const t = setInterval(() => void refetchContainer(), 3000);
    return () => clearInterval(t);
  }, [containerInfo?.id, refetchContainer]);

  const bodyRef = useRef<HTMLDivElement | null>(null);

  const headerHandlers = usePointerDrag(view, scenePos, setScenePos, {
    skipSelector: "button,input",
  });
  const resizeHandlers = usePointerResize(view, sceneSize, setSceneSize, {
    minW: 360,
    minH: 220,
  });

  const handleOpen = useCallback(
    async (e: WorkspaceListEntry) => {
      const ws = workspaceToFull(e);
      onWorkspaceChange(ws);
      setSelectedFile(null);
      // tree は key={workspace.id} で再マウントされ、内部の useEffect で root を loadDir する
      // preview は selectedFile=null を見て自動でクリアされる
      // touch lastOpenedAt (失敗は握り潰す。並び順が古いままなだけ)
      try {
        await apiTouchWorkspace(ws.id);
      } catch {}
      // opencode サイドカーの cwd を切替 (fire-and-forget)。新規セッションの
      // session.directory を正しいワークスペースに向けるため。
      // 失敗してもチャット UI 側の初期化で再度 activate されるため致命的ではない。
      // 成功時は OpencodeChat に window event で通知し、新 ws の opencode.json /
      // session 一覧を再ロードさせる (モデル表記が古いまま残らないように)。
      void apiActivateOpencode(ws.id)
        .then(() => {
          window.dispatchEvent(
            new CustomEvent("myworkspaces:opencode-activated", {
              detail: { workspaceId: ws.id },
            }),
          );
        })
        .catch(() => {});
    },
    [onWorkspaceChange],
  );

  const handleAfterDelete = useCallback((p: string) => {
    setSelectedFile((cur) => (cur === p ? null : cur));
  }, []);

  const left = (scenePos.x + view.x) * view.zoom;
  const top = (scenePos.y + view.y) * view.zoom;

  return (
    <div
      className="fixed"
      style={{
        left: 0,
        top: 0,
        width: sceneSize.w,
        height: sceneSize.h,
        transform: `translate(${left}px, ${top}px) scale(${view.zoom})`,
        transformOrigin: "top left",
        perspective: 1200,
        zIndex: z,
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onFocus?.();
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.6s ease-in-out",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className="flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl shadow-slate-900/20"
          style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden" }}
        >
      <FloatingWorkspaceHeader
        containerInfo={containerInfo}
        fontSize={fontSize}
        changeFontSize={changeFontSize}
        scenePos={scenePos}
        sceneSize={sceneSize}
        onZoomToFit={onZoomToFit}
        onFlipToSettings={() => setFlipped(true)}
        headerHandlers={headerHandlers}
      />

      <FloatingWorkspaceSelector
        showHidden={showHidden}
        toggleShowHidden={toggleShowHidden}
        onStartCoding={onStartCoding}
        onStartBusiness={onStartBusiness}
        onStartUbuntu={onStartUbuntu}
        onRefresh={triggerRefresh}
        onOpen={handleOpen}
      />

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-3 py-1 font-mono text-[11px] text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="border-b border-sky-200 bg-sky-50 px-3 py-1 font-mono text-[11px] text-sky-800 break-all">{notice}</div>
      )}

      <div ref={bodyRef} className="flex min-h-0 flex-1">
        <div className="min-w-0 overflow-hidden" style={{ width: `${splitPct}%` }}>
          <FloatingWorkspaceTree
            key={workspace?.id ?? "no-workspace"}
            fontSize={fontSize}
            showHidden={showHidden}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            onAfterDelete={handleAfterDelete}
            refreshSignal={refreshSignal}
          />
        </div>
        <FloatingWorkspacePreview
          selectedFile={selectedFile}
          fontSize={fontSize}
          view={view}
          splitPct={splitPct}
          onSplitPctChange={setSplitPct}
          bodyRef={bodyRef}
          refreshSignal={refreshSignal}
          resizeHandlers={resizeHandlers}
        />
      </div>
        </div>

        {/* Back (settings) */}
        <div
          className="flex flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl shadow-slate-900/20"
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <div
            className="flex h-9 cursor-grab items-center justify-between gap-2 rounded-t-lg border-b border-slate-200 bg-slate-50 px-3 text-xs text-slate-600 active:cursor-grabbing select-none"
            {...headerHandlers}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFlipped(false);
                }}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                title="Workspace パネルに戻る"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <Settings className="h-3.5 w-3.5 text-slate-500" />
              <span className="font-mono font-medium text-slate-700">settings</span>
            </div>
            <span className="truncate font-mono text-[10px] text-slate-400">
              sub: demo
            </span>
          </div>
          <SettingsPanel onResetContainer={onResetContainer} />
          <div
            className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
            {...resizeHandlers}
            style={{ background: "linear-gradient(135deg, transparent 50%, rgba(100,116,139,0.4) 50%)" }}
          />
        </div>
      </div>
    </div>
  );
}
