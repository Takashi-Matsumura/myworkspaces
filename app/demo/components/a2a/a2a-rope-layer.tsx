"use client";

// Phase 3: A2A ロープを描画する SVG レイヤー。
// - 画面全体の overlay (position: fixed; pointer-events: none)
// - 個別ロープ <path> だけ pointer-events: auto にして context menu / hover を取る
// - ロープは scenePos/sceneSize から「右辺中央」アンカーをスクリーン座標で算出し、
//   ベジェで結ぶ
// - drag 中なら fromX/fromY → mouseX/mouseY の仮ロープ (gradient) を描画

import { useMemo } from "react";
import type { View } from "../whiteboard-canvas";
import type {
  A2ADragState,
  A2APanelStates,
  PanelGeo,
} from "./panel-registry";
import type { A2APanel } from "@/lib/a2a/prefix";
import type { Rope } from "./use-ropes";
import type { RopeActivity } from "./use-rope-activity";

export type AnchorPoint = { x: number; y: number };

// 各パネルの「右辺中央」アンカーを screen 座標で算出。
// outer の transform は `translate(left, top) scale(view.zoom)` なので、
// scene 座標を view.zoom と view.x/y で射影すれば screen 座標になる。
export function anchorScreenPos(
  geo: PanelGeo | null,
  view: View,
): AnchorPoint | null {
  if (!geo) return null;
  const x = view.zoom * (geo.x + geo.w + view.x);
  const y = view.zoom * (geo.y + geo.h / 2 + view.y);
  return { x, y };
}

// ベジェ path. 制御点は両端の中点を水平方向に少し外に出して垂れた感を出す
export function bezierPath(a: AnchorPoint, b: AnchorPoint): string {
  const dx = Math.abs(b.x - a.x);
  const offset = Math.max(60, dx * 0.4);
  const c1x = a.x + offset;
  const c1y = a.y + 20;
  const c2x = b.x - offset;
  const c2y = b.y + 20;
  return `M ${a.x},${a.y} C ${c1x},${c1y} ${c2x},${c2y} ${b.x},${b.y}`;
}

const PANEL_COLOR: Record<A2APanel, string> = {
  biz: "#22c55e", // 緑系 (Excel グリーン寄り)
  code: "#10b981", // 青緑寄り
};

export default function A2ARopeLayer({
  view,
  panelStates,
  ropes,
  drag,
  activity,
  onContextMenu,
}: {
  view: View;
  panelStates: A2APanelStates;
  ropes: Rope[];
  drag: A2ADragState | null;
  activity?: Record<string, RopeActivity | undefined>;
  onContextMenu?: (rope: Rope, e: React.MouseEvent) => void;
}) {
  // 各 panel kind のアンカー screen 座標。
  const anchors = useMemo(() => {
    return {
      biz: anchorScreenPos(panelStates.biz.geo, view),
      code: anchorScreenPos(panelStates.code.geo, view),
    } satisfies Record<A2APanel, AnchorPoint | null>;
  }, [panelStates, view]);

  return (
    <svg
      className="fixed inset-0"
      style={{
        // パネルは z-index 40〜59、Footer は 60。ロープはパネル本体の上に出すと
        // 入力を阻害するので、パネル下 (z=35) で背面に置く。
        // pointer-events: none で全体は素通り、個別 path だけ auto にする。
        pointerEvents: "none",
        zIndex: 35,
      }}
      width="100%"
      height="100%"
    >
      {/* 既存ロープ */}
      {ropes.map((rope) => {
        const a = anchors[rope.fromPanel];
        const b = anchors[rope.toPanel];
        if (!a || !b) return null;
        const d = bezierPath(a, b);
        const pathId = `a2a-rope-${rope.id}`;
        const stroke = rope.active
          ? PANEL_COLOR[rope.fromPanel]
          : "#94a3b8";
        const act = activity?.[rope.id];
        // direction: relay 元が rope.fromPanel と一致なら順方向 (a→b)
        const reverse = act ? act.fromPanel !== rope.fromPanel : false;
        return (
          <g key={rope.id} style={{ pointerEvents: "auto" }}>
            <path
              id={pathId}
              d={d}
              stroke={stroke}
              strokeOpacity={rope.active ? 0.8 : 0.5}
              strokeWidth={3}
              strokeDasharray={rope.active ? undefined : "6 6"}
              fill="none"
              strokeLinecap="round"
              onContextMenu={(e) => {
                if (!onContextMenu) return;
                e.preventDefault();
                onContextMenu(rope, e);
              }}
            />
            {/* アンカー両端のドット */}
            <circle cx={a.x} cy={a.y} r={4} fill={stroke} />
            <circle cx={b.x} cy={b.y} r={4} fill={stroke} />
            {/* relay 発生時に path に沿って円が走る。messageId が変わるたびに再生 */}
            {act && (
              <circle
                key={act.messageId}
                r={6}
                fill="#facc15"
                stroke="#ca8a04"
                strokeWidth={1}
              >
                <animateMotion
                  dur="1.4s"
                  repeatCount="1"
                  fill="freeze"
                  keyPoints={reverse ? "1;0" : "0;1"}
                  keyTimes="0;1"
                >
                  <mpath xlinkHref={`#${pathId}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        );
      })}

      {/* D&D 中の仮ロープ */}
      {drag && (
        <g style={{ pointerEvents: "none" }}>
          <path
            d={bezierPath(
              { x: drag.fromX, y: drag.fromY },
              { x: drag.mouseX, y: drag.mouseY },
            )}
            stroke="#facc15"
            strokeOpacity={0.85}
            strokeWidth={3}
            strokeDasharray="4 4"
            fill="none"
            strokeLinecap="round"
          />
          <circle
            cx={drag.fromX}
            cy={drag.fromY}
            r={5}
            fill="#facc15"
          />
          <circle
            cx={drag.mouseX}
            cy={drag.mouseY}
            r={5}
            fill="#facc15"
            fillOpacity={0.6}
          />
        </g>
      )}
    </svg>
  );
}
