"use client";

import { useCallback, useRef, type PointerEvent } from "react";
import type { View } from "../components/whiteboard-canvas";

type Position = { x: number; y: number };

type DragState = { sx: number; sy: number; px: number; py: number };

export function usePointerDrag(
  view: View,
  position: Position,
  setPosition: (next: Position) => void,
  opts?: { skipSelector?: string },
) {
  const dragRef = useRef<DragState | null>(null);
  const skipSelector = opts?.skipSelector ?? "button";

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest(skipSelector)) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        px: position.x,
        py: position.y,
      };
    },
    [position.x, position.y, skipSelector],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      setPosition({
        x: d.px + (e.clientX - d.sx) / view.zoom,
        y: d.py + (e.clientY - d.sy) / view.zoom,
      });
    },
    [setPosition, view.zoom],
  );

  const onPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
