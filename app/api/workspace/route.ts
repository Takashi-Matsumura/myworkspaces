import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { listDirectory, WorkspaceError } from "@/lib/workspace";

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
    const entries = await listDirectory(user.id, pathParam);
    return NextResponse.json({ entries });
  } catch (err) {
    if (err instanceof WorkspaceError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api/workspace] list failed", err);
    return NextResponse.json(
      { error: (err as Error).message ?? "list failed" },
      { status: 500 },
    );
  }
}
