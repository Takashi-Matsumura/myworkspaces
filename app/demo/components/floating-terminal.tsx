"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import dynamic from "next/dynamic";
import {
  X,
  Minus,
  Maximize2,
  ArrowUpDown,
  CirclePlus,
  CircleMinus,
  FileText,
  Wand2,
  HelpCircle,
  TerminalSquare,
} from "lucide-react";
import type { View, SceneRect } from "./whiteboard-canvas";
import type { BackTab } from "./back-tabs-panel";

const XtermView = dynamic(() => import("./xterm-view"), { ssr: false });
// Business パネルは 表面=opencode チャット / 裏面=BackTabsPanel (RAG/スキル/ヘルプ)。
// Coding/Ubuntu パネルは従来どおり XtermView ベース。
const OpencodeChat = dynamic(() => import("./opencode-chat"), { ssr: false });
const CodingConsole = dynamic(() => import("./coding-console"), {
  ssr: false,
});
const BackTabsPanel = dynamic(() => import("./back-tabs-panel"), {
  ssr: false,
});
const RagDocuments = dynamic(() => import("./rag-documents"), { ssr: false });
const OpencodeSkills = dynamic(() => import("./opencode-skills"), {
  ssr: false,
});
const BusinessHelp = dynamic(() => import("./business-help"), { ssr: false });
const CodingHelp = dynamic(() => import("./coding-help"), { ssr: false });

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

const iconClass = { width: "1em", height: "1em" } as const;

const businessTabs: BackTab[] = [
  {
    key: "rag",
    label: "RAG ドキュメント",
    icon: <FileText style={iconClass} />,
    render: ({ fontSize }) => <RagDocuments fontSize={fontSize} />,
  },
  {
    key: "skills",
    label: "スキル",
    icon: <Wand2 style={iconClass} />,
    render: ({ fontSize }) => (
      <OpencodeSkills fontSize={fontSize} variant="business" />
    ),
  },
  {
    key: "help",
    label: "ヘルプ",
    icon: <HelpCircle style={iconClass} />,
    render: ({ fontSize }) => <BusinessHelp fontSize={fontSize} />,
  },
];

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
  const [cursorStyle, setCursorStyle] = useState<"bar" | "block" | "underline">("bar");
  const [scrollback, setScrollback] = useState(10000);

  // マウント時に外観設定 (defaultPanelWidth/Height, cursorStyle, scrollback,
  // defaultFontSize) を取得して反映する。fontSize は localStorage の個別値が
  // あればそれを優先 (利用者がパネル毎に上書きしている可能性があるため)。
  // ウィンドウサイズはデフォルトを上書きするので初回マウントの瞬間だけ
  // 720x440 でちらつくが、許容する。
  const settingsLoadedRef = useRef(false);
  useEffect(() => {
    if (settingsLoadedRef.current) return;
    settingsLoadedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) return;
        const { settings } = (await res.json()) as {
          settings: {
            appearance?: {
              defaultFontSize?: number;
              defaultPanelWidth?: number;
              defaultPanelHeight?: number;
              cursorStyle?: "bar" | "block" | "underline";
              scrollback?: number;
            };
          };
        };
        const ap = settings.appearance ?? {};
        if (
          typeof ap.defaultPanelWidth === "number" &&
          typeof ap.defaultPanelHeight === "number"
        ) {
          setSceneSize({ w: ap.defaultPanelWidth, h: ap.defaultPanelHeight });
        }
        if (
          typeof window !== "undefined" &&
          !localStorage.getItem(`terminal-fontSize-${variant}`) &&
          typeof ap.defaultFontSize === "number"
        ) {
          setFontSize(ap.defaultFontSize);
        }
        if (ap.cursorStyle) setCursorStyle(ap.cursorStyle);
        if (typeof ap.scrollback === "number") setScrollback(ap.scrollback);
      } catch {
        // 取得失敗時はフォールバック値で動作するので無視。
      }
    })();
  }, [variant]);

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
  // - coding: 表面 = opencode チャット UI (React), 裏面 = shell (xterm) ※PR 3 で 3 タブ化予定
  // - business: 表面 = opencode チャット UI (React), 裏面 = BackTabsPanel (RAG/スキル/ヘルプ)
  // - ubuntu: 表面 = shell (xterm), 裏面なし
  const frontCmd: "opencode" | "shell" = variant === "ubuntu" ? "shell" : "opencode";
  const backAvailable = variant !== "ubuntu";
  const isBusiness = variant === "business";
  // 表面が React チャット (OpencodeChat) のパネル。Coding と Business が該当。
  const isChatFront = variant === "business" || variant === "coding";

  // Coding 裏面タブ構成。session と backNonce に依存するため関数内で組む。
  // Bash タブの pty は「フリップ済み (backNonce > 0) かつ Bash タブ active」
  // のときだけマウントされる — 裏面を見てすらいないのに pty を張らないよう、
  // 初期 active は "help" に固定して、ユーザが Bash タブを押した瞬間起動する。
  const codingTabs = useMemo<BackTab[]>(
    () => [
      {
        key: "bash",
        label: "Bash",
        icon: <TerminalSquare style={iconClass} />,
        render: ({ fontSize }) =>
          backNonce > 0 && session ? (
            <XtermView
              key={`${backNonce}-${fontSize}-back`}
              cwd={session.cwd}
              cmd="shell"
              fontSize={fontSize}
              cursorStyle={cursorStyle}
              scrollback={scrollback}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[#0b0b0f] px-6 text-center font-mono text-xs text-white/50">
              シェル (bash) を起動するにはフリップしてください
            </div>
          ),
      },
      {
        key: "help",
        label: "ヘルプ",
        icon: <HelpCircle style={iconClass} />,
        render: ({ fontSize }) => <CodingHelp fontSize={fontSize} />,
      },
      {
        key: "skills",
        label: "スキル",
        icon: <Wand2 style={iconClass} />,
        render: ({ fontSize }) => (
          <OpencodeSkills fontSize={fontSize} variant="coding" />
        ),
      },
    ],
    [backNonce, session],
  );

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
          className="rounded p-0.5 text-white hover:bg-white/10"
          title="文字サイズを下げる"
        >
          <CircleMinus className="h-4 w-4" />
        </button>
        <span className="font-mono text-[10px] text-white min-w-[1.5rem] text-center">{fontSize}</span>
        <button
          type="button"
          onClick={() => changeFontSize(1)}
          className="rounded p-0.5 text-white hover:bg-white/10"
          title="文字サイズを上げる"
        >
          <CirclePlus className="h-4 w-4" />
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
                  ? "RAG / スキル / ヘルプを開く"
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
          {headerBar(isChatFront ? `${style.label} — チャット` : style.label)}
          {!minimized && (
            <div
              className={`relative flex-1 overflow-hidden rounded-b-lg ${
                isBusiness ? "bg-white" : "bg-[#0b0b0f]"
              }`}
              // Ubuntu (xterm) だけテーマカラー用 CSS filter を掛ける。
              // Business/Coding の React チャットは filter なしで rootBg が直接効く。
              style={
                variant === "ubuntu" && style.filter
                  ? { filter: style.filter }
                  : undefined
              }
            >
              {isChatFront ? (
                variant === "coding" ? (
                  <CodingConsole fontSize={fontSize} />
                ) : (
                  <OpencodeChat fontSize={fontSize} variant={variant} />
                )
              ) : session ? (
                <XtermView
                  key={`${session.nonce}-${fontSize}-front`}
                  cwd={session.cwd}
                  cmd={frontCmd}
                  fontSize={fontSize}
                  cursorStyle={cursorStyle}
                  scrollback={scrollback}
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
                ? `${style.label} — RAG / スキル / ヘルプ`
                : `${style.label} — Bash / ヘルプ / スキル`,
            )}
            {!minimized && (
              <div
                className={`relative flex-1 overflow-hidden rounded-b-lg ${
                  isBusiness ? "bg-white" : "bg-[#0b0b0f]"
                }`}
              >
                {isBusiness ? (
                  <BackTabsPanel
                    tabs={businessTabs}
                    variant="business"
                    fontSize={fontSize}
                  />
                ) : (
                  <BackTabsPanel
                    tabs={codingTabs}
                    variant="coding"
                    fontSize={fontSize}
                    initialTab="help"
                  />
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
