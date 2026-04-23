import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode, relayResponse } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/opencode/sessions/{id}/abort — 実行中の推論を停止する。
// opencode 側の POST /session/{id}/abort をそのまま中継。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upstream = await fetchOpencode(
    user.id,
    `/session/${encodeURIComponent(id)}/abort`,
    { method: "POST" },
  );
  return relayResponse(upstream);
}
