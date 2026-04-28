import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/a2a/stop-all
// 全 rope を active=false にするキルスイッチ。listener 自体は残るが、
// idle 観測時に rope を引いた時点で active=true のものだけが対象になるので
// 実質ループが止まる。
export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await prisma.rope.updateMany({
    where: { userId: user.id, active: true },
    data: { active: false },
  });
  return NextResponse.json({ stopped: result.count });
}
