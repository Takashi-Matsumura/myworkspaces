import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { syncWorkspaceToRag } from "@/lib/biz/sync-rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase E-B-2: ワークスペース内の reports/*.md と research/*.md を一括で
// RAG sidecar に取り込み、過去レポートを recall_research の検索対象に入れるための route。
//
// ユーザは Cookie 認証 (= ログイン済)。コンテナから来るリクエストではない (UI ボタン専用)。
//
// body:
//   { "workspaceId": "..." }
// 返り値:
//   { synced: SyncedFile[], skipped: SyncedFile[], failed: [{relativePath, error}, ...] }

type RequestBody = {
  workspaceId?: string;
};

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (typeof body.workspaceId !== "string" || body.workspaceId.length === 0) {
    return NextResponse.json(
      { error: "workspaceId (string) is required" },
      { status: 400 },
    );
  }

  try {
    const result = await syncWorkspaceToRag(user.id, body.workspaceId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "sync failed" },
      { status: 500 },
    );
  }
}
