"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ZoomIn,
  ZoomOut,
  Layers,
  PenTool,
  Folder,
  CodeXml,
  TerminalSquare,
} from "lucide-react";
import type { View, CanvasActions } from "./demo/components/whiteboard-canvas";
import type { Workspace } from "./demo/components/floating-workspace";
import type { TerminalSession } from "./demo/components/floating-terminal";

type PanelId = "workspace" | "coding" | "business" | "ubuntu";

// デフォルトの重なり順。後ろほど手前に来る (末尾が最前面)。
// 起動直後はターミナルをワークスペースより上に置く。
const INITIAL_PANEL_ORDER: PanelId[] = ["workspace", "ubuntu", "business", "coding"];

const WhiteboardCanvas = dynamic(
  () => import("./demo/components/whiteboard-canvas"),
  { ssr: false },
);
const FloatingTerminal = dynamic(
  () => import("./demo/components/floating-terminal"),
  { ssr: false },
);
const FloatingWorkspace = dynamic(
  () => import("./demo/components/floating-workspace"),
  { ssr: false },
);

export default function Home() {
  const canvasRef = useRef<CanvasActions | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [codingSession, setCodingSession] = useState<TerminalSession | null>(null);
  const [businessSession, setBusinessSession] = useState<TerminalSession | null>(null);
  const [ubuntuSession, setUbuntuSession] = useState<TerminalSession | null>(null);
  const [drawOver, setDrawOver] = useState(false);
  const [showToolbar, setShowToolbar] = useState(false);
  const [containerBusy, setContainerBusy] = useState(false);
  const [panelOrder, setPanelOrder] = useState<PanelId[]>(INITIAL_PANEL_ORDER);

  const bringToFront = useCallback((id: PanelId) => {
    setPanelOrder((order) => {
      if (order[order.length - 1] === id) return order;
      return [...order.filter((p) => p !== id), id];
    });
  }, []);

  // z-index は 40 起点、末尾ほど手前。footer (z-[60]) より下に収める。
  const zFor = (id: PanelId): number => 40 + panelOrder.indexOf(id);
  const frontPanel = panelOrder[panelOrder.length - 1];

  // ワークスペース切替時は cwd を持つセッションが意味を失うので、
  // setState をまとめて呼ぶラッパーで一緒にクリアする。effect 内の setState は使わない。
  const handleWorkspaceChange = useCallback((ws: Workspace | null) => {
    setWorkspace((prev) => {
      if (prev?.id !== ws?.id) {
        setCodingSession(null);
        setBusinessSession(null);
        setUbuntuSession(null);
      }
      return ws;
    });
  }, []);

  const startCoding = () => {
    if (!workspace) return;
    setCodingSession({ workspaceId: workspace.id, cwd: workspace.cwd, nonce: Date.now() });
    bringToFront("coding");
  };
  const startBusiness = () => {
    if (!workspace) return;
    setBusinessSession({ workspaceId: workspace.id, cwd: workspace.cwd, nonce: Date.now() });
    bringToFront("business");
  };
  const startUbuntu = () => {
    if (!workspace) return;
    setUbuntuSession({ workspaceId: workspace.id, cwd: workspace.cwd, nonce: Date.now() });
    bringToFront("ubuntu");
  };

  // 設定パネルのコンテナタブから呼ばれる。confirm は呼び出し側で出すため、ここでは出さない。
  // 成功時 true / 失敗・中断時 false を返す。
  const resetContainer = useCallback(async (): Promise<boolean> => {
    if (containerBusy) return false;
    if (!confirm("コンテナを作り直します。/root 以外にインストール/作成したものは失われます。続行しますか？")) {
      return false;
    }
    setContainerBusy(true);
    try {
      setCodingSession(null);
      setBusinessSession(null);
      setUbuntuSession(null);
      const res = await fetch("/api/container", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      alert(`リセットに失敗しました: ${(err as Error).message}`);
      return false;
    } finally {
      setContainerBusy(false);
    }
  }, [containerBusy]);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WhiteboardCanvas
        onView={setView}
        zoomRef={canvasRef}
        drawOverMode={drawOver}
        showToolbar={showToolbar}
      />
      <FloatingWorkspace
        view={view}
        workspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        onStartCoding={startCoding}
        onStartBusiness={startBusiness}
        onStartUbuntu={startUbuntu}
        onZoomToFit={(rect) => canvasRef.current?.zoomToRect(rect)}
        onResetContainer={resetContainer}
        z={zFor("workspace")}
        onFocus={() => bringToFront("workspace")}
      />
      {codingSession && (
        <FloatingTerminal
          view={view}
          session={codingSession}
          onStop={() => setCodingSession(null)}
          onZoomToFit={(rect) => canvasRef.current?.zoomToRect(rect)}
          variant="coding"
          slot="left"
          z={zFor("coding")}
          onFocus={() => bringToFront("coding")}
        />
      )}
      {businessSession && (
        <FloatingTerminal
          view={view}
          session={businessSession}
          onStop={() => setBusinessSession(null)}
          onZoomToFit={(rect) => canvasRef.current?.zoomToRect(rect)}
          variant="business"
          slot="right"
          z={zFor("business")}
          onFocus={() => bringToFront("business")}
        />
      )}
      {ubuntuSession && (
        <FloatingTerminal
          view={view}
          session={ubuntuSession}
          onStop={() => setUbuntuSession(null)}
          onZoomToFit={(rect) => canvasRef.current?.zoomToRect(rect)}
          variant="ubuntu"
          slot="center"
          z={zFor("ubuntu")}
          onFocus={() => bringToFront("ubuntu")}
        />
      )}
      <footer className="fixed right-0 bottom-0 left-0 z-[60] flex h-8 items-center justify-center gap-1 border-t border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="absolute inset-y-0 left-2 flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-500">sub: demo</span>
          <PanelSwitcherButton
            active={frontPanel === "workspace"}
            onClick={() => bringToFront("workspace")}
            label="Workspace"
            title="ワークスペースパネルを最前面に"
          >
            <Folder className="h-3 w-3" />
          </PanelSwitcherButton>
          {codingSession && (
            <PanelSwitcherButton
              active={frontPanel === "coding"}
              onClick={() => bringToFront("coding")}
              label="Coding"
              title="Coding を最前面に"
              accent="#15151c"
            >
              <CodeXml className="h-3 w-3" />
            </PanelSwitcherButton>
          )}
          {businessSession && (
            <PanelSwitcherButton
              active={frontPanel === "business"}
              onClick={() => bringToFront("business")}
              label="Business"
              title="Business を最前面に"
              accent="#217346"
            >
              <CodeXml className="h-3 w-3" />
            </PanelSwitcherButton>
          )}
          {ubuntuSession && (
            <PanelSwitcherButton
              active={frontPanel === "ubuntu"}
              onClick={() => bringToFront("ubuntu")}
              label="Bash"
              title="Bash を最前面に"
              accent="#4f46e5"
            >
              <TerminalSquare className="h-3 w-3" />
            </PanelSwitcherButton>
          )}
        </div>
        <button
          type="button"
          onClick={() => canvasRef.current?.setZoom(Math.max(0.1, view.zoom - 0.1), view)}
          className="rounded p-1 text-slate-600 hover:bg-slate-100"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => canvasRef.current?.resetZoom()}
          className="min-w-[4rem] rounded px-2 py-0.5 text-center font-mono text-xs text-slate-600 hover:bg-slate-100"
          title="Reset zoom"
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => canvasRef.current?.setZoom(Math.min(5, view.zoom + 0.1), view)}
          className="rounded p-1 text-slate-600 hover:bg-slate-100"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <button
          type="button"
          onClick={() => setDrawOver((d) => !d)}
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
            drawOver ? "bg-sky-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
          title={drawOver ? "通常モードに戻す" : "パネルの上に描画"}
        >
          <Layers className="h-3.5 w-3.5" />
          {drawOver ? "Draw Over ON" : "Draw Over"}
        </button>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <button
          type="button"
          onClick={() => setShowToolbar((v) => !v)}
          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
            showToolbar ? "bg-sky-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
          }`}
          title={showToolbar ? "描画ツールを非表示" : "描画ツールを表示"}
        >
          <PenTool className="h-3.5 w-3.5" />
          {showToolbar ? "Toolbar ON" : "Toolbar"}
        </button>
      </footer>
    </main>
  );
}

function PanelSwitcherButton({
  active,
  onClick,
  label,
  title,
  accent,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  const style = active && accent ? { backgroundColor: accent, borderColor: accent } : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
        active
          ? accent
            ? "text-white shadow-sm"
            : "border-slate-600 bg-slate-600 text-white shadow-sm"
          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
      }`}
      style={style}
    >
      {children}
      {label}
    </button>
  );
}
