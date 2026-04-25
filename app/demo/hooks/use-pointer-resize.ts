"use client";

import { useCallback, useRef, type PointerEvent } from "react";
import type { View } from "../components/whiteboard-canvas";

type Size = { w: number; h: number };

type ResizeState = { sx: number; sy: number; sw: number; sh: number };

export function usePointerResize(
  view: View,
  size: Size,
  setSize: (next: Size) => void,
  opts: { minW: number; minH: number },
) {
  const resizeRef = useRef<ResizeState | null>(null);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      resizeRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        sw: size.w,
        sh: size.h,
      };
    },
    [size.w, size.h],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const r = resizeRef.current;
      if (!r) return;
      setSize({
        w: Math.max(opts.minW, r.sw + (e.clientX - r.sx) / view.zoom),
        h: Math.max(opts.minH, r.sh + (e.clientY - r.sy) / view.zoom),
      });
    },
    [setSize, view.zoom, opts.minW, opts.minH],
  );

  const onPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
