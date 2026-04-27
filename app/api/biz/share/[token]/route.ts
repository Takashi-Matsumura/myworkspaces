import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase E-C-3: 共有 URL の失効 (発行者のみ)。

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { token } = await params;
  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (link.userId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.shareLink.delete({ where: { id: link.id } });
  return NextResponse.json({ ok: true });
}
