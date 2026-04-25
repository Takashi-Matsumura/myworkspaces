import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { readFileBytes, WorkspaceError } from "@/lib/workspace";
import { imageContentType } from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/workspace/file/raw?path=...
// 画像プレビュー用に raw bytes を Content-Type 付きで返す。プレビュー対象を
// 画像系の拡張子に限定し、xlsx/pdf 等のバイナリは preview API 経由で markdown 化する。
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pathParam = request.nextUrl.searchParams.get("path");
  if (!pathParam) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  const contentType = imageContentType(pathParam);
  if (!contentType) {
    return NextResponse.json(
      { error: "raw view supported only for image files" },
      { status: 415 },
    );
  }
  try {
    const { buffer } = await readFileBytes(user.id, pathParam, 25 * 1024 * 1024);
    // Buffer をそのまま body に渡すと Next.js が ArrayBuffer に変換してくれる。
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/workspace/file/raw] failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "read failed" },
      { status: 500 },
    );
  }
}
