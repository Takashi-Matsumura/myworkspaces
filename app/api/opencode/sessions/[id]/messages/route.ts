import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode, relayResponse } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/opencode/sessions/{id}/messages — メッセージ履歴
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upstream = await fetchOpencode(
    user.id,
    `/session/${encodeURIComponent(id)}/message`,
  );
  return relayResponse(upstream);
}
