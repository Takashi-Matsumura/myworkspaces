import { NextResponse, type NextRequest } from "next/server";
import { getSub } from "@/lib/user";
import { uploadFile, WorkspaceError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest) {
  const sub = getSub(request);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "multipart parse failed" }, { status: 400 });
  }
  const targetDir = form.get("targetDir");
  const relativePath = form.get("relativePath");
  const file = form.get("file");

  if (typeof targetDir !== "string" || typeof relativePath !== "string") {
    return NextResponse.json(
      { error: "targetDir and relativePath required" },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `file too large (>${MAX_UPLOAD_BYTES} bytes)` },
      { status: 413 },
    );
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await uploadFile(sub, targetDir, relativePath, buf);
    return NextResponse.json({ ok: true, size: buf.byteLength });
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/workspace/upload] failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "upload failed" },
      { status: 500 },
    );
  }
}
