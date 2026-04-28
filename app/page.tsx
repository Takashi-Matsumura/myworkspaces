"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ZoomIn, ZoomOut, Layers, Folder, Ban } from "lucide-react";
import type { View, CanvasActions } from "./demo/components/whiteboard-canvas";
import type { Workspace } from "./demo/components/floating-workspace";
import { AccountBadge } from "./demo/components/account-badge";
import { usePanels } from "./demo/hooks/use-panels";
import { TERMINAL_PANEL_DEFINITIONS } from "./demo/config/terminal-panels";
import type { TerminalPanelId } from "./demo/types/panels";
import {
  EMPTY_A2A_PANEL_STATES,
  type A2ADragState,
  type A2APanelState,
  type A2APanelStates,
  type PanelGeo,
} from "./demo/components/a2a/panel-registry";
import { useRopes } from "./demo/components/a2a/use-ropes";
import { useRopeActivity } from "./demo/components/a2a/use-rope-activity";
import type { A2APanel } from "@/lib/a2a/prefix";

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
const A2ARopeLayer = dynamic(
  () => import("./demo/components/a2a/a2a-rope-layer"),
  { ssr: false },
);

// terminal panel id → A2A panel kind. ubuntu/analyze は A2A 対象外なので null。
function panelIdToA2AKind(id: TerminalPanelId): A2APanel | null {
  if (id === "coding") return "code";
  if (id === "business") return "biz";
  return null;
}

export default function Home() {
  const canvasRef = useRef<CanvasActions | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, zoom: 1 });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [drawOver, setDrawOver] = useState(false);
  const [containerBusy, setContainerBusy] = useState(false);
  const panels = usePanels();

  // Phase 3 (A2A): Biz / Code パネルの geometry と activeSessionId を集約。
  const [a2aPanels, setA2aPanels] = useState<A2APanelStates>(EMPTY_A2A_PANEL_STATES);
  const ropesApi = useRopes();
  const ropes = ropesApi.ropes;
  const ropeActivity = useRopeActivity(ropes);

  const updateA2aPanel = useCallback(
    (kind: A2APanel, patch: Partial<A2APanelState>) => {
      setA2aPanels((prev) => ({ ...prev, [kind]: { ...prev[kind], ...patch } }));
    },
    [],
  );

  const handlePanelGeo = useCallback(
    (kind: A2APanel) => (geo: PanelGeo | null) => {
      updateA2aPanel(kind, { geo });
    },
    [updateA2aPanel],
  );
  const handlePanelActive = useCallback(
    (kind: A2APanel) => (activeSessionId: string | null) => {
      updateA2aPanel(kind, { activeSessionId });
    },
    [updateA2aPanel],
  );

  // D&D 状態。アンカーから別パネルのアンカーまでロープを引く。
  const [drag, setDrag] = useState<A2ADragState | null>(null);

  const handleAnchorPointerDown = useCallback(
    (kind: A2APanel) => (e: React.PointerEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const fromX = rect.left + rect.width / 2;
      const fromY = rect.top + rect.height / 2;
      setDrag({
        fromKind: kind,
        fromX,
        fromY,
        mouseX: e.clientX,
        mouseY: e.clientY,
      });
    },
    [],
  );

  // pointermove / pointerup を document に張る。drag 中だけ active。
  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: PointerEvent) => {
      setDrag((d) => (d ? { ...d, mouseX: ev.clientX, mouseY: ev.clientY } : null));
    };
    const onUp = (ev: PointerEvent) => {
      // drop 先 panel の判定: 反対 kind の panel rect (screen 座標) に入っているか
      const targetKind: A2APanel = drag.fromKind === "biz" ? "code" : "biz";
      const target = a2aPanels[targetKind];
      let hit = false;
      if (target.geo) {
        const left = view.zoom * (target.geo.x + view.x);
        const top = view.zoom * (target.geo.y + view.y);
        const right = left + view.zoom * target.geo.w;
        const bottom = top + view.zoom * target.geo.h;
        hit =
          ev.clientX >= left &&
          ev.clientX <= right &&
          ev.clientY >= top &&
          ev.clientY <= bottom;
      }
      if (hit) {
        const fromSid = a2aPanels[drag.fromKind].activeSessionId;
        const toSid = target.activeSessionId;
        if (fromSid && toSid) {
          void ropesApi.create({
            fromPanel: drag.fromKind,
            toPanel: targetKind,
            fromSessionId: fromSid,
            toSessionId: toSid,
          });
        } else {
          alert(
            "ロープを作るには両パネルでセッションを選択してください (Biz / Code どちらも active session が必要)",
          );
        }
      }
      setDrag(null);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [drag, a2aPanels, view, ropesApi]);

  // 表示するロープ: 両端の active session と一致するもののみ。
  // パネルがまだ存在しない/セッション未選択なら除外。
  const visibleRopes = ropes.filter((r) => {
    const from = a2aPanels[r.fromPanel];
    const to = a2aPanels[r.toPanel];
    if (!from.geo || !to.geo) return false;
    if (from.activeSessionId !== r.fromSessionId) return false;
    if (to.activeSessionId !== r.toSessionId) return false;
    return true;
  });

  // ワークスペース切替時は cwd を持つセッションが意味を失うので、
  // setState をまとめて呼ぶラッパーで一緒にクリアする。effect 内の setState は使わない。
  const handleWorkspaceChange = useCallback(
    (ws: Workspace | null) => {
      setWorkspace((prev) => {
        if (prev?.id !== ws?.id) panels.clearTerminalSessions();
        return ws;
      });
    },
    [panels],
  );

  const openTerminal = (id: TerminalPanelId) => {
    if (!workspace) return;
    panels.openTerminal(id, workspace);
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
      panels.clearTerminalSessions();
      const res = await fetch("/api/container", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (err) {
      alert(`リセットに失敗しました: ${(err as Error).message}`);
      return false;
    } finally {
      setContainerBusy(false);
    }
  }, [containerBusy, panels]);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <WhiteboardCanvas
        onView={setView}
        zoomRef={canvasRef}
        drawOverMode={drawOver}
        showToolbar={drawOver}
      />
      <FloatingWorkspace
        view={view}
        workspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        onStartCoding={() => openTerminal("coding")}
        onStartBusiness={() => openTerminal("business")}
        onStartUbuntu={() => openTerminal("ubuntu")}
        onStartAnalyze={() => openTerminal("analyze")}
        onZoomToFit={(rect) => canvasRef.current?.zoomToRect(rect)}
        onResetContainer={resetContainer}
        z={panels.zFor("workspace")}
        onFocus={() => panels.bringToFront("workspace")}
      />
      {TERMINAL_PANEL_DEFINITIONS.map((def) => {
        const session = panels.sessions.get(def.id);
        if (!session) return null;
        const a2aKind = panelIdToA2AKind(def.id);
        return (
          <FloatingTerminal
            key={def.id}
            view={view}
            session={session}
            onStop={() => panels.closeTerminal(def.id)}
            onZoomToFit={(rect) => canvasRef.current?.zoomToRect(rect)}
            variant={def.variant}
            slot={def.slot}
            z={panels.zFor(def.id)}
            onFocus={() => panels.bringToFront(def.id)}
            onGeoChange={a2aKind ? handlePanelGeo(a2aKind) : undefined}
            onActiveSessionChange={
              a2aKind ? handlePanelActive(a2aKind) : undefined
            }
            onAnchorPointerDown={
              a2aKind ? handleAnchorPointerDown(a2aKind) : undefined
            }
          />
        );
      })}
      <A2ARopeLayer
        view={view}
        panelStates={a2aPanels}
        ropes={visibleRopes}
        drag={drag}
        activity={ropeActivity}
        onContextMenu={(rope) => {
          // 暫定: confirm で「切断 / ミュート / hopLimit 変更」を 1 段階確認
          // (Phase 3 後半で context menu UI を作り込む)
          const choice = window.prompt(
            `ロープ操作: ${rope.fromPanel} → ${rope.toPanel}\n` +
              `1: 削除\n2: ${rope.active ? "ミュート" : "再開"}\n3: hopLimit (現在 ${rope.hopLimit}) を変更\n番号を入力 (空でキャンセル)`,
          );
          if (!choice) return;
          if (choice === "1") void ropesApi.remove(rope.id);
          else if (choice === "2")
            void ropesApi.update(rope.id, { active: !rope.active });
          else if (choice === "3") {
            const v = window.prompt(
              `新しい hopLimit (1〜50, 現在 ${rope.hopLimit})`,
              String(rope.hopLimit),
            );
            const n = v ? Number(v) : NaN;
            if (Number.isFinite(n) && n >= 1 && n <= 50) {
              void ropesApi.update(rope.id, { hopLimit: Math.floor(n) });
            }
          }
        }}
      />
      <footer className="fixed right-0 bottom-0 left-0 z-[60] flex h-8 items-center justify-center gap-1 border-t border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="absolute inset-y-0 left-2 flex items-center gap-2">
          <AccountBadge />
          <PanelSwitcherButton
            active={panels.frontPanel === "workspace"}
            onClick={() => panels.bringToFront("workspace")}
            label="Workspace"
            title="Workspace パネルを最前面に"
          >
            <Folder className="h-3 w-3" />
          </PanelSwitcherButton>
          {TERMINAL_PANEL_DEFINITIONS.map((def) =>
            panels.sessions.has(def.id) ? (
              <PanelSwitcherButton
                key={def.id}
                active={panels.frontPanel === def.id}
                onClick={() => panels.bringToFront(def.id)}
                label={def.switcherLabel}
                title={def.switcherTitle}
                accent={def.switcherAccent}
              >
                {def.switcherIcon}
              </PanelSwitcherButton>
            ) : null,
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
          title={drawOver ? "通常モードに戻す" : "パネルの上に描画 (Toolbar 表示 / Grid 非表示)"}
        >
          <Layers className="h-3.5 w-3.5" />
          {drawOver ? "Draw Over ON" : "Draw Over"}
        </button>
        {ropes.some((r) => r.active) && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "全ての A2A ロープをミュートします (rope.active = false)。続行しますか？",
                )
              ) {
                void ropesApi.stopAll();
              }
            }}
            className="ml-1 inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
            title="全 A2A ロープを停止 (個別ミュートは右クリックメニューから)"
          >
            <Ban className="h-3.5 w-3.5" />
            A2A 全停止
          </button>
        )}
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
