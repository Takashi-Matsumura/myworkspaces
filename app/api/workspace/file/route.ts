import { NextResponse, type NextRequest } from "next/server";
import { getSub } from "@/lib/user";
import { readFile, WorkspaceError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sub = getSub(request);
  const pathParam = request.nextUrl.searchParams.get("path");
  if (!pathParam) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  try {
    const payload = await readFile(sub, pathParam);
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
