import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { findWorkspaceById } from "@/lib/user-store";
import { syncTemplateRules, WorkspaceError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/user/workspaces/{id}/sync-rules
// テンプレートのルール .md を最新版で上書き +
// opencode.json の instructions / agent.<name> にテンプレデフォルトをマージ挿入
// (既存ユーザー設定は保持)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await findWorkspaceById(user.id, id);
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const result = await syncTemplateRules(user.id, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof WorkspaceError ? err.status : 500;
    const message = err instanceof Error ? err.message : "sync failed";
    return NextResponse.json({ error: message }, { status });
  }
}
