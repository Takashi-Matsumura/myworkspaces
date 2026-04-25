import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { deleteFile, readFile, WorkspaceError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pathParam = request.nextUrl.searchParams.get("path");
  if (!pathParam) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  try {
    const payload = await readFile(user.id, pathParam);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/workspace/file] read failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "read failed" },
      { status: 500 },
    );
  }
}

// DELETE /api/workspace/file?path=<absolute>
// ワークスペース内のファイルを 1 個削除する。ディレクトリは対象外。
export async function DELETE(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pathParam = request.nextUrl.searchParams.get("path");
  if (!pathParam) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  try {
    await deleteFile(user.id, pathParam);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/workspace/file] delete failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "delete failed" },
      { status: 500 },
    );
  }
}
