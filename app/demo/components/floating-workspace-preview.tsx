"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import FilePreview from "./file-preview";
import { useWorkspace } from "./workspace-context";
import { apiPreviewFile } from "../api/workspace";
import type { PreviewResult } from "@/lib/preview";
import type { View } from "./whiteboard-canvas";

type Props = {
  selectedFile: string | null;
  fontSize: number;
  view: View;
  splitPct: number;
  onSplitPctChange: (pct: number) => void;
  bodyRef: RefObject<HTMLDivElement | null>;
  refreshSignal: number;
  // 右下リサイザのハンドラ (panel 全体のリサイズ)。preview が右下にあるため preview が描画する。
  resizeHandlers: {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  };
};

export function FloatingWorkspacePreview({
  selectedFile,
  fontSize,
  view,
  splitPct,
  onSplitPctChange,
  bodyRef,
  refreshSignal,
  resizeHandlers,
}: Props) {
  const { setError } = useWorkspace();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [fileLoading, setFileLoading] = useState(false);

  // selectedFile が変わったら preview を取得 (null になったらクリア)
  useEffect(() => {
    if (!selectedFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreview(null);
      return;
    }
    let cancelled = false;
    setFileLoading(true);
    setError(null);
    void apiPreviewFile(selectedFile)
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch((e: unknown) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setFileLoading(false); });
    return () => { cancelled = true; };
  }, [selectedFile, setError]);

  // refresh signal に応じて選択中ファイルを再取得
  useEffect(() => {
    if (refreshSignal === 0 || !selectedFile) return;
    let cancelled = false;
    void apiPreviewFile(selectedFile)
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch((e: unknown) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
    // selectedFile / setError は意図的に省略 (signal の変化で trigger)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const splitRef = useRef<{ sx: number; startPct: number; containerW: number } | null>(null);

  const onSplitPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      const rect = bodyRef.current?.getBoundingClientRect();
      if (!rect) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      splitRef.current = { sx: e.clientX, startPct: splitPct, containerW: rect.width / view.zoom };
    },
    [bodyRef, splitPct, view.zoom],
  );

  const onSplitPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!splitRef.current) return;
      const s = splitRef.current;
      const deltaPct = ((e.clientX - s.sx) / view.zoom / s.containerW) * 100;
      const next = Math.max(15, Math.min(85, s.startPct + deltaPct));
      onSplitPctChange(next);
    },
    [onSplitPctChange, view.zoom],
  );

  const onSplitPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    splitRef.current = null;
  }, []);

  return (
    <>
      <div
        className="w-1 shrink-0 cursor-ew-resize bg-slate-200 hover:bg-sky-300"
        onPointerDown={onSplitPointerDown}
        onPointerMove={onSplitPointerMove}
        onPointerUp={onSplitPointerUp}
      />
      <div className="relative min-w-0 flex-1 overflow-hidden bg-white">
        <div className="h-full overflow-auto">
          {fileLoading && (
            <div className="px-3 py-2 font-mono text-slate-400" style={{ fontSize }}>reading…</div>
          )}
          {!fileLoading && preview && (
            <FilePreview result={preview} fontSize={fontSize} />
          )}
          {!fileLoading && !preview && (
            <div className="px-3 py-2 font-mono text-slate-400" style={{ fontSize }}>ファイル表示（簡易）</div>
          )}
        </div>
        <div
          className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
          {...resizeHandlers}
          style={{ background: "linear-gradient(135deg, transparent 50%, rgba(100,116,139,0.4) 50%)" }}
        />
      </div>
    </>
  );
}
