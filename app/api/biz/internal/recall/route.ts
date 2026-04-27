import { NextResponse, type NextRequest } from "next/server";
import { getRagSidecarUrl } from "@/lib/docker-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase E-B-1: コンテナ内 opencode の recall_research tool 用エンドポイント。
//
// 認証は web-search と同じ X-Biz-Tool-Token ヘッダ (== process.env.BIZ_TOOL_TOKEN)。
// ただし RAG sidecar は **ユーザーごとに分離** されているため、対象ユーザーの sub
// を X-MyWorkspaces-Sub ヘッダで明示的に渡してもらう。コンテナ自体がそのユーザーに
// 紐付いている (1 コンテナ = 1 ユーザー) ので、コンテナ内プロセスから来た sub は
// 信頼可能。
//
// body:
//   { "query": "...", "top_k"?: number }
// 返り値:
//   { "hits": [{doc_id, filename, chunk_index, text, score}, ...] }

type RequestBody = {
  query?: string;
  top_k?: number;
};

function unauthorized(reason: string) {
  return NextResponse.json({ error: `unauthorized: ${reason}` }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const expected = process.env.BIZ_TOOL_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "BIZ_TOOL_TOKEN is not configured on the server" },
      { status: 503 },
    );
  }
  const got = req.headers.get("x-biz-tool-token");
  if (!got) return unauthorized("missing X-Biz-Tool-Token");
  if (got !== expected) return unauthorized("invalid X-Biz-Tool-Token");

  const sub = req.headers.get("x-myworkspaces-sub");
  if (!sub) return unauthorized("missing X-MyWorkspaces-Sub");

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return NextResponse.json(
      { error: "query (string) is required" },
      { status: 400 },
    );
  }

  let sidecarUrl: string;
  try {
    sidecarUrl = await getRagSidecarUrl(sub);
  } catch (err) {
    return NextResponse.json(
      { error: `rag sidecar unavailable: ${(err as Error).message}` },
      { status: 503 },
    );
  }

  try {
    const resp = await fetch(`${sidecarUrl}/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: body.query,
        top_k: body.top_k,
      }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      let detail = text.slice(0, 500);
      try {
        const j = JSON.parse(text) as { detail?: string; error?: string };
        if (j.detail) detail = j.detail;
        else if (j.error) detail = j.error;
      } catch {
        /* noop */
      }
      return NextResponse.json(
        { error: `rag /search HTTP ${resp.status}: ${detail}` },
        { status: 502 },
      );
    }
    const json = JSON.parse(text) as { hits?: unknown };
    return NextResponse.json({ hits: Array.isArray(json.hits) ? json.hits : [] });
  } catch (err) {
    return NextResponse.json(
      { error: `rag /search fetch failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
