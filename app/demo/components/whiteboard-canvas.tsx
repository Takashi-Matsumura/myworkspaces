"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Excalidraw, getSceneVersion } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

export type View = { x: number; y: number; zoom: number };

export type SceneRect = { x: number; y: number; w: number; h: number };

export type ZoomToRectFn = (rect: SceneRect) => void;

export type CanvasActions = {
  zoomToRect: ZoomToRectFn;
  resetZoom: () => void;
  setZoom: (newZoom: number, currentView: View) => void;
};

// onChange → PUT のデバウンス時間。ユーザが入力を止めて N ms 経ったら保存。
const SAVE_DEBOUNCE_MS = 1500;

// fetch 前は初期データが決まらないので Excalidraw のマウントを遅延させる。
type LoadedData = {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
} | null;

type ExcalidrawApi = {
  updateScene: (opts: { appState: Record<string, unknown> }) => void;
  getSceneElements?: () => readonly unknown[];
  getAppState?: () => Record<string, unknown>;
};

export default function WhiteboardCanvas({
  onView,
  zoomRef,
  drawOverMode = false,
  showToolbar = false,
}: {
  onView?: (v: View) => void;
  zoomRef?: MutableRefObject<CanvasActions | null>;
  drawOverMode?: boolean;
  showToolbar?: boolean;
}) {
  const [api, setApi] = useState<ExcalidrawApi | null>(null);
  const [loaded, setLoaded] = useState<LoadedData>(null);
  const [loadError, setLoadError] = useState(false);

  // 変更検知: getSceneVersion が前回保存時と同じなら保存をスキップする。
  const lastSavedVersionRef = useRef<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // flush 用に「次に保存すべきスナップショット」を保持する。
  const pendingRef = useRef<{
    elements: readonly unknown[];
    appState: Record<string, unknown>;
  } | null>(null);

  // ─────── 初期データ読込 ───────
  useEffect(() => {
    let cancel = false;
    fetch("/api/whiteboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancel) return;
        const elements = Array.isArray(data?.elements) ? data.elements : [];
        const appState = (data?.appState ?? {}) as Record<string, unknown>;
        lastSavedVersionRef.current = getSceneVersion(elements as never);
        setLoaded({ elements, appState });
      })
      .catch((err) => {
        console.warn("[whiteboard] load failed, starting empty", err);
        if (!cancel) {
          lastSavedVersionRef.current = getSceneVersion([] as never);
          setLoaded({ elements: [], appState: {} });
          setLoadError(true);
        }
      });
    return () => {
      cancel = true;
    };
  }, []);

  // ─────── 保存処理 ───────
  const flushSave = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    const payload = JSON.stringify(pending);
    // fetch keepalive でアンロード時も確実に送る
    fetch("/api/whiteboard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: payload.length < 60 * 1024, // 60KB 以下は keepalive OK
    }).catch((err) => console.warn("[whiteboard] save failed", err));
  }, []);

  const scheduleSave = useCallback(
    (elements: readonly unknown[], appState: Record<string, unknown>) => {
      pendingRef.current = { elements, appState };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const handleChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
    ) => {
      const v = getSceneVersion(elements as never);
      if (v === lastSavedVersionRef.current) return; // 視覚要素に変化なし
      lastSavedVersionRef.current = v;
      const savedAppState = {
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      };
      scheduleSave(elements, savedAppState);
    },
    [scheduleSave],
  );

  // unmount / タブを閉じる時に pending を flush
  useEffect(() => {
    const onBeforeUnload = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      flushSave();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      onBeforeUnload();
    };
  }, [flushSave]);

  // ─────── drawOverMode / zoomRef (既存ロジック) ───────
  useEffect(() => {
    if (!api) return;
    api.updateScene({
      appState: {
        viewBackgroundColor: drawOverMode ? "transparent" : "#ffffff",
      },
    });
  }, [api, drawOverMode]);

  useEffect(() => {
    if (!zoomRef || !api) return;
    zoomRef.current = {
      zoomToRect(rect) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const zoom = Math.min((vw * 0.8) / rect.w, (vh * 0.8) / rect.h);
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        api.updateScene({
          appState: {
            scrollX: vw / (2 * zoom) - cx,
            scrollY: vh / (2 * zoom) - cy,
            zoom: { value: zoom },
          },
        });
      },
      resetZoom() {
        api.updateScene({
          appState: {
            scrollX: 0,
            scrollY: 0,
            zoom: { value: 1 },
          },
        });
      },
      setZoom(newZoom, currentView) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const oldZoom = currentView.zoom;
        const newScrollX =
          vw / (2 * newZoom) - vw / (2 * oldZoom) + currentView.x;
        const newScrollY =
          vh / (2 * newZoom) - vh / (2 * oldZoom) + currentView.y;
        api.updateScene({
          appState: {
            scrollX: newScrollX,
            scrollY: newScrollY,
            zoom: { value: newZoom },
          },
        });
      },
    };
    return () => {
      zoomRef.current = null;
    };
  }, [api, zoomRef]);

  return (
    <div
      style={{ position: "absolute", inset: 0, zIndex: drawOverMode ? 55 : undefined }}
      onPointerDown={() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
      }}
    >
      <style>{`
        .excalidraw .layer-ui__wrapper__footer-left,
        .excalidraw .layer-ui__wrapper__footer-right,
        .excalidraw .welcome-screen-center,
        .excalidraw .main-menu-trigger,
        .excalidraw .App-menu_bottom,
        .excalidraw .layer-ui__library {
          display: none !important;
        }
        ${!showToolbar ? `
        .excalidraw .layer-ui__wrapper__top-left,
        .excalidraw .layer-ui__wrapper__top-right,
        .excalidraw .App-toolbar-container {
          display: none !important;
        }
        ` : ""}
      `}</style>
      {loaded ? (
        <Excalidraw
          gridModeEnabled={drawOverMode}
          initialData={{
            elements: loaded.elements as never,
            appState: loaded.appState as never,
            scrollToContent: false,
          }}
          excalidrawAPI={(a) => setApi(a as typeof api)}
          onScrollChange={(scrollX, scrollY, zoom) =>
            onView?.({ x: scrollX, y: scrollY, zoom: zoom.value })
          }
          onChange={(elements, appState) =>
            handleChange(
              elements as readonly unknown[],
              appState as unknown as Record<string, unknown>,
            )
          }
        />
      ) : null}
      {loadError ? (
        <div className="absolute top-2 right-2 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 shadow-sm">
          白板の読み込みに失敗しました (空で開始)
        </div>
      ) : null}
    </div>
  );
}
