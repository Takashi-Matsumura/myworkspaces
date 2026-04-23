import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { getRagSidecarUrl } from "@/lib/docker-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 取り込み 1 ファイル上限。LLM のコンテキストに収まらない巨大ファイルは
// 事前に分割してもらう想定 (RAG の chunking は sidecar 側にも別途あり)。
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "multipart parse failed" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `file too large (>${MAX_UPLOAD_BYTES} bytes)` },
      { status: 413 },
    );
  }

  // 先に Prisma 側に insert して doc_id (= RagDocument.id) を確定させ、
  // Qdrant 側のペイロードと同じ ID を使う。sidecar 側が失敗したらロールバックする。
  const created = await prisma.ragDocument.create({
    data: {
      userId: user.id,
      filename: file.name,
      bytes: file.size,
      chunkCount: 0,
    },
  });

  try {
    const sidecarUrl = await getRagSidecarUrl(user.id);
    const forward = new FormData();
    forward.append("doc_id", created.id);
    forward.append("filename", file.name);
    forward.append("file", file, file.name);

    const resp = await fetch(`${sidecarUrl}/ingest`, {
      method: "POST",
      body: forward,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`sidecar /ingest failed (${resp.status}): ${body.slice(0, 200)}`);
    }
    const payload = (await resp.json()) as { chunk_count?: number };
    const chunkCount = typeof payload.chunk_count === "number" ? payload.chunk_count : 0;
    const updated = await prisma.ragDocument.update({
      where: { id: created.id },
      data: { chunkCount },
    });
    return NextResponse.json({
      id: updated.id,
      filename: updated.filename,
      bytes: updated.bytes,
      chunkCount: updated.chunkCount,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    // sidecar への取り込みが失敗したら、メタ行を残すと一覧が壊れるので削除。
    await prisma.ragDocument.delete({ where: { id: created.id } }).catch(() => {});
    console.error("[api/rag/upload] failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "upload failed" },
      { status: 500 },
    );
  }
}
