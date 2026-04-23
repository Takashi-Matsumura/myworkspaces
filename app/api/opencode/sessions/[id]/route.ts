import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode, relayResponse } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/opencode/sessions/{id}
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const upstream = await fetchOpencode(
    user.id,
    `/session/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return relayResponse(upstream);
}
