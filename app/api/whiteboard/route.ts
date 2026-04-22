import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ペイロード上限 (1 枚 1〜2MB を想定)。大規模画像付きには対応しない方針。
const MAX_BYTES = 4 * 1024 * 1024;

type SavedAppState = {
  scrollX?: number;
  scrollY?: number;
  zoom?: { value: number } | number;
};

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const row = await prisma.whiteboard.findUnique({ where: { userId: user.id } });
  if (!row) {
    return NextResponse.json({ elements: [], appState: {} });
  }
  return NextResponse.json({
    elements: row.elements,
    appState: row.appState,
    updatedAt: row.updatedAt.getTime(),
  });
}

export async function PUT(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `payload too large (> ${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const b = (body ?? {}) as { elements?: unknown; appState?: unknown };
  const elements = Array.isArray(b.elements) ? b.elements : [];
  const appState = sanitizeAppState(b.appState);

  await prisma.whiteboard.upsert({
    where: { userId: user.id },
    create: { userId: user.id, elements, appState },
    update: { elements, appState },
  });

  return NextResponse.json({ ok: true });
}

// 復元時に必要な最低限のフィールドだけ保存する。
// 現在編集中のツールやカーソルなどは毎回リセットで構わない。
function sanitizeAppState(input: unknown): SavedAppState {
  const s = (input ?? {}) as Record<string, unknown>;
  const out: SavedAppState = {};
  if (typeof s.scrollX === "number") out.scrollX = s.scrollX;
  if (typeof s.scrollY === "number") out.scrollY = s.scrollY;
  if (typeof s.zoom === "number") {
    out.zoom = s.zoom;
  } else if (s.zoom && typeof s.zoom === "object") {
    const v = (s.zoom as { value?: unknown }).value;
    if (typeof v === "number") out.zoom = { value: v };
  }
  return out;
}
