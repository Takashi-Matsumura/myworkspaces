import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { getCurrentWorkspaceId, workspaceCwd } from "@/lib/user-store";
import { readFile, WorkspaceError } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProviderConfig = {
  name?: string;
  models?: Record<string, { name?: string } | undefined>;
};

// GET /api/opencode/config[?workspaceId=ws_xxx]
// 指定 (または current) ワークスペースの opencode.json を読んで、model 表示に
// 必要な部分だけ整形して返す。opencode の /session/{id}/message の info.model
// は assistant 側では null、user 側には session slug が入る奇妙なスキーマな
// ので、UI 表示には信頼できる opencode.json を引く。
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const wsIdParam = url.searchParams.get("workspaceId");
  const wsId = wsIdParam ?? (await getCurrentWorkspaceId(user.id));
  if (!wsId) {
    return NextResponse.json({ error: "no workspace" }, { status: 404 });
  }

  const filePath = `${workspaceCwd(wsId)}/opencode.json`;
  let payload;
  try {
    payload = await readFile(user.id, filePath);
  } catch (err) {
    const status = err instanceof WorkspaceError ? err.status : 500;
    return NextResponse.json(
      { error: "opencode.json not found", workspaceId: wsId },
      { status: status === 500 ? 500 : 404 },
    );
  }

  let config: {
    model?: unknown;
    provider?: Record<string, ProviderConfig>;
  };
  try {
    config = JSON.parse(payload.content);
  } catch {
    return NextResponse.json(
      { error: "invalid opencode.json", workspaceId: wsId },
      { status: 500 },
    );
  }

  const modelStr = typeof config.model === "string" ? config.model : "";
  const [providerID = "", modelID = ""] = modelStr.split("/");
  const provider = config.provider?.[providerID];
  const providerName =
    typeof provider?.name === "string" ? provider.name : providerID;
  const modelEntry = provider?.models?.[modelID];
  const modelName =
    typeof modelEntry?.name === "string" ? modelEntry.name : modelID;

  return NextResponse.json({
    workspaceId: wsId,
    providerID,
    modelID,
    providerName,
    modelName,
  });
}
