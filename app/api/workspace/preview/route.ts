import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { previewFile } from "@/lib/preview";
import { WorkspaceError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/workspace/preview?path=<absolute container path>
// 拡張子に応じて kind: "markdown" | "text" | "image" を返す。
// xlsx / csv / pdf は markdown 化された content を、画像は rawUrl を含む。
export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const pathParam = request.nextUrl.searchParams.get("path");
  if (!pathParam) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  try {
    const result = await previewFile(user.id, pathParam);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/workspace/preview] failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "preview failed" },
      { status: 500 },
    );
  }
}
