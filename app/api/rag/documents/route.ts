import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { getRagSidecarUrl } from "@/lib/docker-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const docs = await prisma.ragDocument.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      bytes: true,
      chunkCount: true,
      createdAt: true,
    },
  });
  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      filename: d.filename,
      bytes: d.bytes,
      chunkCount: d.chunkCount,
      createdAt: d.createdAt.toISOString(),
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await prisma.ragDocument.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const sidecarUrl = await getRagSidecarUrl(user.id);
    const resp = await fetch(
      `${sidecarUrl}/documents/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    // sidecar 側が 404 でも Prisma は残ってしまうので、本体 (Prisma) 側は必ず消す。
    if (!resp.ok && resp.status !== 404) {
      const body = await resp.text().catch(() => "");
      console.warn(`[api/rag/documents] sidecar delete ${resp.status}: ${body}`);
    }
  } catch (err) {
    // sidecar 到達不能でも Prisma 側は消して UI を整合させる。
    // データとしては孤児が Qdrant 側に残るが、次回の /documents DELETE で回収可能。
    console.warn("[api/rag/documents] sidecar unreachable, removing meta anyway", err);
  }

  await prisma.ragDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true, id });
}
