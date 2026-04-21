"use client";

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ZoomIn, ZoomOut, Layers, PenTool, RefreshCw } from "lucide-react";
import type { View, CanvasActions } from "./demo/components/whiteboard-canvas";
import type { Workspace } from "./demo/components/floating-workspace";
import type { TerminalSession } from "./demo/components/floating-terminal";

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
  };
  const startBusiness = () => {
    if (!workspace) return;
    setBusinessSession({ workspaceId: workspace.id, cwd: workspace.cwd, nonce: Date.now() });
  };
  const startUbuntu = () => {
    if (!workspace) return;
    setUbuntuSession({ workspaceId: workspace.id, cwd: workspace.cwd, nonce: Date.now() });
  };

  const resetContainer = async () => {
    if (containerBusy) return;
    if (!confirm("コンテナを作り直します。/root 以外にインストール/作成したものは失われます。続行しますか？")) {
      return;
    }
    setContainerBusy(true);
    try {
      setCodingSession(null);
      setBusinessSession(null);
      setUbuntuSession(null);
      const res = await fetch("/api/container", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      alert(`リセットに失敗しました: ${(err as Error).message}`);
    } finally {
      setContainerBusy(false);
    }
  };

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
      />
      {codingSession && (
        <FloatingTerminal
          view={view}
          session={codingSession}
          onStop={() => setCodingSession(null)}
          onZoomToFit={(rect) => canvasRef.current?.zoomToRect(rect)}
          variant="coding"
          slot="left"
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
        />
      )}
      <footer className="fixed right-0 bottom-0 left-0 z-[60] flex h-8 items-center justify-center gap-1 border-t border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="absolute inset-y-0 left-2 flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-500">sub: demo</span>
          <button
            type="button"
            onClick={resetContainer}
            disabled={containerBusy}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            title="コンテナを作り直す (/root 以外はリセット)"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${containerBusy ? "animate-spin" : ""}`} />
          </button>
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
