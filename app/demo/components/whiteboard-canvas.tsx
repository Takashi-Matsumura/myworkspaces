"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

export type View = { x: number; y: number; zoom: number };

export type SceneRect = { x: number; y: number; w: number; h: number };

export type ZoomToRectFn = (rect: SceneRect) => void;

export type CanvasActions = {
  zoomToRect: ZoomToRectFn;
  resetZoom: () => void;
  setZoom: (newZoom: number, currentView: View) => void;
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
  const [api, setApi] = useState<{
    updateScene: (opts: {
      appState: Record<string, unknown>;
    }) => void;
  } | null>(null);

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
      <Excalidraw
        gridModeEnabled={!drawOverMode}
        excalidrawAPI={(a) => setApi(a as typeof api)}
        onScrollChange={(scrollX, scrollY, zoom) =>
          onView?.({ x: scrollX, y: scrollY, zoom: zoom.value })
        }
      />
    </div>
  );
}
