import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode, relayResponse } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/opencode/sessions — セッション一覧 (TUI と共有)
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const upstream = await fetchOpencode(user.id, "/session");
  return relayResponse(upstream);
}

// POST /api/opencode/sessions — セッション作成
// body は opencode の /session POST にそのまま転送 (title 等を含む場合もあるので)
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.text();
  const upstream = await fetchOpencode(user.id, "/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw || "{}",
  });
  return relayResponse(upstream);
}
