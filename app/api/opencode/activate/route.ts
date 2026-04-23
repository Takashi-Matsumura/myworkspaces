import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { findWorkspaceById, touchWorkspace } from "@/lib/user-store";
import { getUserNetworkIsolation } from "@/lib/user-network";
import { activateOpencodeSidecar } from "@/lib/docker-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/opencode/activate — opencode サイドカーの current workspace を切替
// body: { "workspaceId": "ws_xxx" }
//
// opencode serve は session.directory を cwd で固定するため、ワークスペース
// 切替には **コンテナの再作成** が必要。この API は Workspace.lastOpenedAt を
// 更新した上で ensureOpencodeSidecar を呼び、WorkingDir が異なる場合に自動で
// rm → create を行う。UI 側はワークスペース選択時にこれを呼んでから新 UI で
// セッションを開始する想定。
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { workspaceId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
  }

  // 他人のワークスペースを指定されたら拒否
  const ws = await findWorkspaceById(user.id, workspaceId);
  if (!ws) {
    return NextResponse.json({ error: "workspace not found" }, { status: 404 });
  }

  // current workspace を更新 (lastOpenedAt) してから ensureOpencodeSidecar
  await touchWorkspace(user.id, workspaceId);
  const isolated = await getUserNetworkIsolation(user.id);
  const container = await activateOpencodeSidecar(user.id, isolated, workspaceId);
  const info = await container.inspect();

  return NextResponse.json({
    ok: true,
    workspaceId,
    container: {
      name: info.Name?.replace(/^\//, "") ?? "",
      running: Boolean(info.State?.Running),
      workingDir: info.Config?.WorkingDir ?? null,
    },
  });
}
