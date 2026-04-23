"use client";

import {
  useRef,
  useState,
  type PointerEvent,
} from "react";
import dynamic from "next/dynamic";
import { X, Minus, Maximize2, ArrowUpDown } from "lucide-react";
import type { View, SceneRect } from "./whiteboard-canvas";

const XtermView = dynamic(() => import("./xterm-view"), { ssr: false });
// Business パネルは 表面=opencode チャット / 裏面=RAG ドキュメント。
// Coding/Ubuntu パネルは従来どおり XtermView ベース。
const OpencodeChat = dynamic(() => import("./opencode-chat"), { ssr: false });
const RagDocuments = dynamic(() => import("./rag-documents"), { ssr: false });
const OpencodeHintOverlay = dynamic(() => import("./opencode-hint-overlay"), {
  ssr: false,
});

type ScenePos = { x: number; y: number };
type SceneSize = { w: number; h: number };

export type TerminalSession = { workspaceId: string; cwd: string; nonce: number };
export type TerminalVariant = "coding" | "business" | "ubuntu";

type VariantStyle = {
  label: string;
  headerBg: string;
  headerText: string;
  headerBorder: string;
  panelBorder: string;
  panelBg: string;
  filter?: string;
};

const VARIANT_STYLES: Record<TerminalVariant, VariantStyle> = {
  coding: {
    label: "opencode — coding",
    headerBg: "bg-[#15151c]",
    headerText: "text-white",
    headerBorder: "border-white/10 border-t-2 border-t-emerald-500",
    panelBorder: "border border-white/10 shadow-black/50",
    panelBg: "#0b0b0f",
  },
  business: {
    label: "opencode — business",
    headerBg: "bg-[#217346]",
    headerText: "text-white",
    headerBorder: "border-[#b7d9b7]",
    panelBorder: "border border-[#b7d9b7] shadow-green-900/20",
    panelBg: "#eaf5ea",
    filter:
      "invert(0.93) sepia(0.2) hue-rotate(75deg) saturate(1.8) contrast(1.15) brightness(1.02)",
  },
  ubuntu: {
    label: "ubuntu — bash",
    headerBg: "bg-[#1e1b4b]",
    headerText: "text-white",
    headerBorder: "border-white/10 border-t-2 border-t-indigo-400",
    panelBorder: "border border-white/10 shadow-black/50",
    panelBg: "#0b0b0f",
  },
};

function defaultSlotOffset(slot: "left" | "center" | "right"): { cx: number; cy: number } {
  if (typeof window === "undefined") return { cx: 80, cy: 80 };
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (slot === "left") {
    return { cx: Math.max(0, w * 0.25 - 360), cy: Math.max(0, (h - 440) / 2) };
  }
  if (slot === "right") {
    return { cx: w * 0.55, cy: Math.max(0, (h - 440) / 2) };
  }
  return { cx: Math.max(0, (w - 720) / 2), cy: Math.max(0, (h - 440) / 2) };
}

export default function FloatingTerminal({
  view,
  session,
  onStop,
  onZoomToFit,
  variant = "coding",
  slot = "left",
  z,
  onFocus,
}: {
  view: View;
  session: TerminalSession | null;
  onStop: () => void;
  onZoomToFit?: (rect: SceneRect) => void;
  variant?: TerminalVariant;
  slot?: "left" | "center" | "right";
  z: number;
  onFocus?: () => void;
}) {
  const style = VARIANT_STYLES[variant];

  const [scenePos, setScenePos] = useState<ScenePos>(() => {
    const { cx, cy } = defaultSlotOffset(slot);
    return { x: cx, y: cy };
  });
  const [sceneSize, setSceneSize] = useState<SceneSize>({ w: 720, h: 440 });
  const [minimized, setMinimized] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [backNonce, setBackNonce] = useState(0);
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === "undefined") return 13;
    const saved = localStorage.getItem(`terminal-fontSize-${variant}`);
    return saved ? Number(saved) : 13;
  });

  const changeFontSize = (delta: number) => {
    setFontSize((prev) => {
      const next = Math.min(28, Math.max(10, prev + delta));
      localStorage.setItem(`terminal-fontSize-${variant}`, String(next));
      return next;
    });
  };

  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const resizeRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);

  const onHeaderPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: scenePos.x, py: scenePos.y };
  };
  const onHeaderPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setScenePos({
      x: d.px + (e.clientX - d.sx) / view.zoom,
      y: d.py + (e.clientY - d.sy) / view.zoom,
    });
  };
  const onHeaderPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  const onResizePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { sx: e.clientX, sy: e.clientY, sw: sceneSize.w, sh: sceneSize.h };
  };
  const onResizePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const r = resizeRef.current;
    setSceneSize({
      w: Math.max(320, r.sw + (e.clientX - r.sx) / view.zoom),
      h: Math.max(180, r.sh + (e.clientY - r.sy) / view.zoom),
    });
  };
  const onResizePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    resizeRef.current = null;
  };

  const handleFlip = () => {
    if (!flipped && backNonce === 0) setBackNonce(Date.now());
    setFlipped((f) => !f);
  };

  const left = (scenePos.x + view.x) * view.zoom;
  const top = (scenePos.y + view.y) * view.zoom;

  // variant ごとの表裏:
  // - coding: 表面 = opencode TUI (xterm), 裏面 = shell (xterm)
  // - business: 表面 = opencode チャット UI (React), 裏面 = RAG ドキュメント
  // - ubuntu: 表面 = shell (xterm), 裏面なし
  const frontCmd: "opencode" | "shell" = variant === "ubuntu" ? "shell" : "opencode";
  const backAvailable = variant !== "ubuntu";
  const isBusiness = variant === "business";

  const headerBar = (title: string) => (
    <div
      className={`flex h-9 cursor-grab items-center gap-2 rounded-t-lg border-b px-3 text-xs active:cursor-grabbing select-none ${style.headerBorder} ${style.headerBg} ${style.headerText}`}
      onPointerDown={onHeaderPointerDown}
      onPointerMove={onHeaderPointerMove}
      onPointerUp={onHeaderPointerUp}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onStop}
          className="group h-3 w-3 rounded-full bg-[#ff5f57] hover:brightness-110"
          title="パネルを閉じる"
        >
          <X className="hidden h-3 w-3 stroke-[3] text-black/60 group-hover:block" />
        </button>
        <button
          type="button"
          onClick={() => setMinimized((m) => !m)}
          className="group h-3 w-3 rounded-full bg-[#febc2e] hover:brightness-110"
          title={minimized ? "元に戻す" : "最小化"}
        >
          <Minus className="hidden h-3 w-3 stroke-[3] text-black/60 group-hover:block" />
        </button>
        <button
          type="button"
          onClick={() =>
            onZoomToFit?.({ x: scenePos.x, y: scenePos.y, w: sceneSize.w, h: sceneSize.h })
          }
          className="group h-3 w-3 rounded-full bg-[#28c840] hover:brightness-110"
          title="80% フィット表示"
        >
          <Maximize2 className="hidden h-2.5 w-2.5 stroke-[3] text-black/60 group-hover:block" style={{ margin: "0.5px" }} />
        </button>
      </div>
      <span className="ml-1 flex-1 font-mono">{title}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => changeFontSize(-1)}
          className="rounded px-1 text-[10px] text-white hover:bg-white/10"
          title="文字サイズを下げる"
        >
          A-
        </button>
        <span className="font-mono text-[10px] text-white min-w-[1.5rem] text-center">{fontSize}</span>
        <button
          type="button"
          onClick={() => changeFontSize(1)}
          className="rounded px-1 text-[10px] text-white hover:bg-white/10"
          title="文字サイズを上げる"
        >
          A+
        </button>
        {backAvailable && (
          <button
            type="button"
            onClick={handleFlip}
            className="ml-1 rounded p-0.5 text-white hover:bg-white/10"
            title={
              flipped
                ? variant === "business"
                  ? "チャットに戻す"
                  : "表面に戻す"
                : variant === "business"
                  ? "RAG ドキュメントを開く"
                  : "シェルを開く"
            }
          >
            <ArrowUpDown className="h-3.5 w-3.5 rotate-90" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed"
      style={{
        left: 0,
        top: 0,
        width: sceneSize.w,
        height: minimized ? 36 : sceneSize.h,
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
          className={`flex flex-col rounded-lg shadow-2xl backdrop-blur ${style.panelBorder}`}
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            backgroundColor: style.panelBg,
          }}
        >
          {headerBar(isBusiness ? `${style.label} — チャット` : style.label)}
          {!minimized && (
            <div
              className={`relative flex-1 overflow-hidden rounded-b-lg ${
                isBusiness ? "bg-white" : "bg-[#0b0b0f]"
              }`}
              // Business は React チャット (白ベース) なので CSS filter は当てない。
              // Coding/Ubuntu は XtermView ベースなのでテーマカラー用の filter を適用。
              style={
                !isBusiness && style.filter ? { filter: style.filter } : undefined
              }
            >
              {isBusiness ? (
                <OpencodeChat />
              ) : session ? (
                <XtermView
                  key={`${session.nonce}-${fontSize}-front`}
                  cwd={session.cwd}
                  cmd={frontCmd}
                  fontSize={fontSize}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#0b0b0f] px-6 text-center font-mono text-xs text-white/50">
                  Workspace パネルからワークスペースを選択して起動してください
                </div>
              )}
              <div
                className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
                onPointerDown={onResizePointerDown}
                onPointerMove={onResizePointerMove}
                onPointerUp={onResizePointerUp}
                style={{
                  background: isBusiness
                    ? "linear-gradient(135deg, transparent 50%, rgba(33,115,70,0.3) 50%)"
                    : "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.25) 50%)",
                }}
              />
            </div>
          )}
          {/* 初回ガイドは Coding の xterm TUI に対してのみ有効。Business は
              React チャット UI なのでヒントは不要。 */}
          {!minimized && variant === "coding" && (
            <OpencodeHintOverlay variant={variant} />
          )}
        </div>

        {/* Back (ubuntu variant 以外)。
            Business 裏面は RAG ドキュメント、Coding 裏面は shell (bash)。 */}
        {backAvailable && (
          <div
            className={`flex flex-col rounded-lg shadow-2xl backdrop-blur ${style.panelBorder}`}
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              backgroundColor: style.panelBg,
            }}
          >
            {headerBar(
              isBusiness
                ? `${style.label} — RAG ドキュメント`
                : `${style.label} — shell`,
            )}
            {!minimized && (
              <div
                className={`relative flex-1 overflow-hidden rounded-b-lg ${
                  isBusiness ? "bg-white" : "bg-[#0b0b0f]"
                }`}
              >
                {isBusiness ? (
                  <RagDocuments />
                ) : backNonce > 0 && session ? (
                  <XtermView
                    key={`${backNonce}-${fontSize}-back`}
                    cwd={session.cwd}
                    cmd="shell"
                    fontSize={fontSize}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#0b0b0f] px-6 text-center font-mono text-xs text-white/50">
                    シェル (bash) を起動するにはフリップしてください
                  </div>
                )}
                <div
                  className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
                  onPointerDown={onResizePointerDown}
                  onPointerMove={onResizePointerMove}
                  onPointerUp={onResizePointerUp}
                  style={{
                    background:
                      variant === "business"
                        ? "linear-gradient(135deg, transparent 50%, rgba(33,115,70,0.3) 50%)"
                        : "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.25) 50%)",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
