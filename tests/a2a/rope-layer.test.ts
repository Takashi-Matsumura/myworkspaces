import { describe, expect, it } from "vitest";
import {
  anchorScreenPos,
  bezierPath,
} from "@/app/demo/components/a2a/a2a-rope-layer";

describe("anchorScreenPos", () => {
  it("returns null when geo is missing", () => {
    expect(anchorScreenPos(null, { x: 0, y: 0, zoom: 1 })).toBeNull();
  });

  it("zoom=1, view origin の場合は右辺中央を返す", () => {
    // geo: 100,200 サイズ 300x100 → 右辺中央は (400, 250)
    const geo = { x: 100, y: 200, w: 300, h: 100 };
    const p = anchorScreenPos(geo, { x: 0, y: 0, zoom: 1 });
    expect(p).toEqual({ x: 400, y: 250 });
  });

  it("view.x / view.y の平行移動を反映する", () => {
    const geo = { x: 100, y: 200, w: 300, h: 100 };
    const p = anchorScreenPos(geo, { x: 50, y: -10, zoom: 1 });
    // (100+300+50, 200+50-10) = (450, 240)
    expect(p).toEqual({ x: 450, y: 240 });
  });

  it("zoom 倍率を screen 座標に乗じる", () => {
    const geo = { x: 100, y: 200, w: 300, h: 100 };
    const p = anchorScreenPos(geo, { x: 0, y: 0, zoom: 2 });
    // 2 * (400, 250) = (800, 500)
    expect(p).toEqual({ x: 800, y: 500 });
  });
});

describe("bezierPath", () => {
  it("近距離は最小 offset 60 が適用される", () => {
    const d = bezierPath({ x: 100, y: 100 }, { x: 110, y: 100 });
    // dx=10 → offset = max(60, 10*0.4) = 60
    expect(d).toBe("M 100,100 C 160,120 50,120 110,100");
  });

  it("遠距離は dx*0.4 が適用される", () => {
    const d = bezierPath({ x: 0, y: 0 }, { x: 1000, y: 200 });
    // dx=1000 → offset = max(60, 400) = 400
    expect(d).toBe("M 0,0 C 400,20 600,220 1000,200");
  });

  it("path は M ... C ... の形式で 2 制御点を含む", () => {
    const d = bezierPath({ x: 1, y: 2 }, { x: 3, y: 4 });
    expect(d).toMatch(/^M -?[\d.]+,-?[\d.]+ C -?[\d.]+,-?[\d.]+ -?[\d.]+,-?[\d.]+ -?[\d.]+,-?[\d.]+$/);
  });
});
