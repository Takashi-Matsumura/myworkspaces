import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

// GET /api/a2a/ropes/{id}/messages
// 監査用: 直近 50 件の relay 履歴 (delivered / skipped 含む)。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const rope = await prisma.rope.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!rope) return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = await prisma.a2AMessage.findMany({
    where: { ropeId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ messages });
}
