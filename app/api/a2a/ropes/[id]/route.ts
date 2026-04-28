import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const existing = await prisma.rope.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    active?: boolean;
    hopLimit?: number;
  };

  const data: { active?: boolean; hopLimit?: number } = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (
    typeof body.hopLimit === "number" &&
    body.hopLimit > 0 &&
    body.hopLimit <= 50
  ) {
    data.hopLimit = Math.floor(body.hopLimit);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.rope.update({ where: { id }, data });
  return NextResponse.json({ rope: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(request);
  if (!user) return unauthorized();

  const { id } = await params;
  const existing = await prisma.rope.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.rope.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
