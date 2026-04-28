"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  BookOpen,
  Anchor,
} from "lucide-react";
import type { View, SceneRect } from "./whiteboard-canvas";
import type { BackTab } from "./back-tabs-panel";
import { usePointerDrag } from "../hooks/use-pointer-drag";
import { usePointerResize } from "../hooks/use-pointer-resize";
import { useFontSize } from "../hooks/use-font-size";
import { use3dFlip } from "../hooks/use-3d-flip";
import { terminalFontSizeKey } from "../lib/storage-keys";
import { SettingsResponseSchema } from "@/lib/api-schemas";

const XtermView = dynamic(() => import("./xterm-view"), { ssr: false });
// Business / Coding / Analyze は React チャット表面 + Bash/ヘルプ/スキル 裏面。
// Ubuntu は従来どおり XtermView ベース。
const BusinessConsole = dynamic(() => import("./business-console"), {
  ssr: false,
});
const CodingConsole = dynamic(() => import("./coding-console"), {
  ssr: false,
});
const AnalysisConsole = dynamic(() => import("./analysis-console"), {
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
const AnalysisHelp = dynamic(() => import("./analysis-help"), { ssr: false });
const ShellHelp = dynamic(() => import("./shell-help"), { ssr: false });
const ShellCheatsheet = dynamic(() => import("./shell-cheatsheet"), {
  ssr: false,
});

type ScenePos = { x: number; y: number };
type SceneSize = { w: number; h: number };

export type TerminalSession = { workspaceId: string; cwd: string; nonce: number };
export type TerminalVariant = "coding" | "business" | "ubuntu" | "analyze";

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
  analyze: {
    label: "opencode — analyze",
    headerBg: "bg-[#1a1530]",
    headerText: "text-white",
    headerBorder: "border-white/10 border-t-2 border-t-violet-400",
    panelBorder: "border border-white/10 shadow-black/50",
    panelBg: "#100c1f",
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

// Shell (ubuntu) パネル裏面のタブ。session に依存しないので module 定数で OK。
const shellTabs: BackTab[] = [
  {
    key: "help",
    label: "ヘルプ",
    icon: <HelpCircle style={iconClass} />,
    render: ({ fontSize }) => <ShellHelp fontSize={fontSize} />,
  },
  {
    key: "cheatsheet",
    label: "コマンド集",
    icon: <BookOpen style={iconClass} />,
    render: ({ fontSize }) => <ShellCheatsheet fontSize={fontSize} />,
  },
];

// 現在表示しているホワイトボードの「中心」にパネルを置きたい。
// パネルは scenePos (シーン座標) で位置を持ち、画面上は
//   left = (scenePos.x + view.x) * view.zoom
// で描画される。よってビューポート中心 (window.innerWidth/2, innerHeight/2) に
// パネル中央が来るように逆算すると:
//   scenePos.x = (innerWidth/2) / view.zoom - sceneSize.w/2 - view.x
// 4 つ同時に開いた時に完全重複しないよう、variant 別に少しだけオフセットする
// (シーン座標での値なので zoom 不変)。Analyze は Business と同 slot="right" を共有する
// ため、variant ごとに別オフセットを与えて初回マウント位置をずらす。
function defaultScenePos(
  slot: "left" | "center" | "right",
  variant: TerminalVariant,
  view: View,
  size: { w: number; h: number },
): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  const baseX = window.innerWidth / 2 / view.zoom - size.w / 2 - view.x;
  const baseY = window.innerHeight / 2 / view.zoom - size.h / 2 - view.y;
  // Analyze は Business と slot="right" を共有するので、初期位置だけ更に右下にずらす
  if (variant === "analyze") {
    return { x: baseX + 120, y: baseY + 60 };
  }
  const dx = slot === "left" ? -40 : slot === "right" ? 40 : 0;
  const dy = slot === "left" ? -20 : slot === "right" ? 20 : 0;
  return { x: baseX + dx, y: baseY + dy };
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
  onGeoChange,
  onActiveSessionChange,
  onAnchorPointerDown,
}: {
  view: View;
  session: TerminalSession | null;
  onStop: () => void;
  onZoomToFit?: (rect: SceneRect) => void;
  variant?: TerminalVariant;
  slot?: "left" | "center" | "right";
  z: number;
  onFocus?: () => void;
  // Phase 3 (A2A):
  // - onGeoChange: scenePos/sceneSize 変化時に呼ばれる。null は unmount 通知
  // - onActiveSessionChange: 内部の Console (Biz/Code) の activeId 変化を中継
  // - onAnchorPointerDown: アンカー (⚓) ボタンの mousedown を親に通知
  //   → 親側で D&D 状態を hold して RopeLayer に渡す
  onGeoChange?: (geo: { x: number; y: number; w: number; h: number } | null) => void;
  onActiveSessionChange?: (sessionId: string | null) => void;
  onAnchorPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const style = VARIANT_STYLES[variant];

  // マウント時の view を一度だけ参照して中心位置を決定。以降ユーザがドラッグで自由に動かせる。
  const [scenePos, setScenePos] = useState<ScenePos>(() =>
    defaultScenePos(slot, variant, view, { w: 720, h: 440 }),
  );
  const [sceneSize, setSceneSize] = useState<SceneSize>({ w: 720, h: 440 });
  const [minimized, setMinimized] = useState(false);
  const { flipped, setFlipped } = use3dFlip(false);
  const [backNonce, setBackNonce] = useState(0);
  const { fontSize, setFontSize, changeFontSize } = useFontSize(
    terminalFontSizeKey(variant),
    { default: 13, min: 10, max: 28 },
  );
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
        const { settings } = SettingsResponseSchema.parse(await res.json());
        const ap = settings.appearance;
        if (
          typeof ap.defaultPanelWidth === "number" &&
          typeof ap.defaultPanelHeight === "number"
        ) {
          setSceneSize({ w: ap.defaultPanelWidth, h: ap.defaultPanelHeight });
        }
        if (
          typeof window !== "undefined" &&
          !localStorage.getItem(terminalFontSizeKey(variant)) &&
          typeof ap.defaultFontSize === "number"
        ) {
          // raw setter で設定 — localStorage には書かないことで「ユーザがまだ
          // 手動指定していないなら API 既定値を見る」という意味を保つ。
          setFontSize(ap.defaultFontSize);
        }
        if (ap.cursorStyle) setCursorStyle(ap.cursorStyle);
        if (typeof ap.scrollback === "number") setScrollback(ap.scrollback);
      } catch {
        // 取得失敗時はフォールバック値で動作するので無視。
      }
    })();
  }, [variant, setFontSize]);

  const headerHandlers = usePointerDrag(view, scenePos, setScenePos);
  const resizeHandlers = usePointerResize(view, sceneSize, setSceneSize, {
    minW: 320,
    minH: 180,
  });

  // Phase 3: A2A registry に scenePos/sceneSize を通知。最新 callback は ref 経由で
  // 参照することで、callback 自体が変わっても deps 変動を起こさない。
  const onGeoChangeRef = useRef(onGeoChange);
  useEffect(() => {
    onGeoChangeRef.current = onGeoChange;
  }, [onGeoChange]);
  useEffect(() => {
    onGeoChangeRef.current?.({
      x: scenePos.x,
      y: scenePos.y,
      w: sceneSize.w,
      h: sceneSize.h,
    });
  }, [scenePos.x, scenePos.y, sceneSize.w, sceneSize.h]);
  useEffect(() => {
    return () => {
      onGeoChangeRef.current?.(null);
    };
  }, []);

  const handleFlip = () => {
    if (!flipped && backNonce === 0) setBackNonce(Date.now());
    setFlipped((f) => !f);
  };

  const left = (scenePos.x + view.x) * view.zoom;
  const top = (scenePos.y + view.y) * view.zoom;

  // variant ごとの表裏:
  // - coding: 表面 = opencode チャット UI (React), 裏面 = Bash / ヘルプ / スキル
  // - business: 表面 = opencode チャット UI (React), 裏面 = BackTabsPanel (RAG/スキル/ヘルプ)
  // - analyze: 表面 = AnalysisConsole (React), 裏面 = Bash / ヘルプ (Analyze 専用) / スキル
  // - ubuntu: 表面 = shell (xterm), 裏面 = ヘルプ + コマンド集 (シェル/Git 入門)
  const frontCmd: "opencode" | "shell" = variant === "ubuntu" ? "shell" : "opencode";
  const backAvailable = true;
  const isBusiness = variant === "business";
  const isUbuntu = variant === "ubuntu";
  // 表面が React チャット (OpencodeChat / CodingConsole / AnalysisConsole) のパネル。
  const isChatFront =
    variant === "business" || variant === "coding" || variant === "analyze";

  // Coding / Analyze 裏面タブ構成。session と backNonce に依存するため関数内で組む。
  // Bash タブの pty は「フリップ済み (backNonce > 0) かつ Bash タブ active」
  // のときだけマウントされる — 裏面を見てすらいないのに pty を張らないよう、
  // 初期 active は "help" に固定して、ユーザが Bash タブを押した瞬間起動する。
  // help タブの内容だけ Coding (CodingHelp) と Analyze (AnalysisHelp) で差し替える。
  const codingLikeTabs = useMemo<BackTab[]>(
    () => {
      const HelpComponent = variant === "analyze" ? AnalysisHelp : CodingHelp;
      return [
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
          render: ({ fontSize }) => <HelpComponent fontSize={fontSize} />,
        },
        {
          key: "skills",
          label: "スキル",
          icon: <Wand2 style={iconClass} />,
          render: ({ fontSize }) => (
            <OpencodeSkills fontSize={fontSize} variant="coding" />
          ),
        },
      ];
    },
    [backNonce, session, variant, cursorStyle, scrollback],
  );

  const headerBar = (title: string) => (
    <div
      className={`flex h-9 cursor-grab items-center gap-2 rounded-t-lg border-b px-3 text-xs active:cursor-grabbing select-none ${style.headerBorder} ${style.headerBg} ${style.headerText}`}
      {...headerHandlers}
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
                ? variant === "ubuntu"
                  ? "シェルに戻す"
                  : variant === "business"
                    ? "チャットに戻す"
                    : "表面に戻す"
                : variant === "business"
                  ? "RAG / スキル / ヘルプを開く"
                  : variant === "ubuntu"
                    ? "ヘルプ / コマンド集を開く"
                    : "Bash / ヘルプ / スキルを開く"
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
                  <CodingConsole
                    fontSize={fontSize}
                    onActiveSessionChange={onActiveSessionChange}
                  />
                ) : variant === "analyze" ? (
                  <AnalysisConsole fontSize={fontSize} />
                ) : (
                  <BusinessConsole
                    fontSize={fontSize}
                    onActiveSessionChange={onActiveSessionChange}
                  />
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
                {...resizeHandlers}
                style={{
                  background: isBusiness
                    ? "linear-gradient(135deg, transparent 50%, rgba(33,115,70,0.3) 50%)"
                    : "linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.25) 50%)",
                }}
              />
            </div>
          )}
        </div>

        {/* Back: variant ごとに構成が違う。
            - business: RAG / スキル / ヘルプ
            - coding / analyze: Bash / ヘルプ / スキル
            - ubuntu: ヘルプのみ (タブバーなし) */}
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
                : isUbuntu
                  ? `${style.label} — ヘルプ / コマンド集`
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
                ) : isUbuntu ? (
                  <BackTabsPanel
                    tabs={shellTabs}
                    variant="coding"
                    fontSize={fontSize}
                    initialTab="help"
                  />
                ) : (
                  <BackTabsPanel
                    tabs={codingLikeTabs}
                    variant="coding"
                    fontSize={fontSize}
                    initialTab="help"
                  />
                )}
                <div
                  className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize"
                  {...resizeHandlers}
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

      {/* A2A アンカー (⚓): biz / code パネルのみ右辺中央に配置。
          parent に pointerdown を中継して D&D 開始してもらう。
          フリップ状態に関わらず常に同位置に出る (rotating wrapper の外)。 */}
      {onAnchorPointerDown && (variant === "business" || variant === "coding") && (
        <button
          type="button"
          title="ロープを伸ばす (相手パネルへドラッグ)"
          onPointerDown={(e) => {
            e.stopPropagation();
            onAnchorPointerDown(e);
          }}
          className="absolute flex h-6 w-6 cursor-grab items-center justify-center rounded-full border border-white/40 bg-black/70 text-white shadow-md hover:bg-black/85 active:cursor-grabbing"
          style={{
            right: -10,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
          }}
        >
          <Anchor className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
