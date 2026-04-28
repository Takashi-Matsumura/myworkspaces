import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { ensureA2aListener } from "@/lib/a2a/listener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PANEL_VALUES = new Set(["biz", "code"]);

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const ropes = await prisma.rope.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ ropes });
}

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    fromPanel?: string;
    toPanel?: string;
    fromSessionId?: string;
    toSessionId?: string;
    hopLimit?: number;
  };

  if (!body.fromPanel || !PANEL_VALUES.has(body.fromPanel)) {
    return NextResponse.json({ error: "fromPanel must be 'biz' or 'code'" }, { status: 400 });
  }
  if (!body.toPanel || !PANEL_VALUES.has(body.toPanel)) {
    return NextResponse.json({ error: "toPanel must be 'biz' or 'code'" }, { status: 400 });
  }
  if (body.fromPanel === body.toPanel) {
    return NextResponse.json({ error: "fromPanel and toPanel must differ" }, { status: 400 });
  }
  if (!body.fromSessionId || !body.toSessionId) {
    return NextResponse.json(
      { error: "fromSessionId and toSessionId are required" },
      { status: 400 },
    );
  }
  const hopLimit =
    typeof body.hopLimit === "number" && body.hopLimit > 0 && body.hopLimit <= 50
      ? Math.floor(body.hopLimit)
      : 5;

  const rope = await prisma.rope.create({
    data: {
      userId: user.id,
      fromPanel: body.fromPanel,
      toPanel: body.toPanel,
      fromSessionId: body.fromSessionId,
      toSessionId: body.toSessionId,
      hopLimit,
      active: true,
    },
  });

  // listener が未起動なら起動 (idempotent)
  ensureA2aListener(user.id);

  return NextResponse.json({ rope }, { status: 201 });
}
