import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode, relayResponse } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/opencode/sessions/{id}/prompt — 非同期メッセージ送信 (204 即 return)
// body: { "parts": [{"type":"text","text":"..."}], ... }
// 結果は /api/opencode/events の SSE を購読して message.part.delta 等で受ける
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const raw = await req.text();
  const upstream = await fetchOpencode(
    user.id,
    `/session/${encodeURIComponent(id)}/prompt_async`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw,
    },
  );
  return relayResponse(upstream);
}
