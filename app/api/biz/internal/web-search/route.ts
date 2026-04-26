import { NextResponse, type NextRequest } from "next/server";
import { getSearchProvider } from "@/lib/biz/search-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// コンテナ内の opencode web_search tool 用エンドポイント。
//
// 認証は Cookie ではなく X-Biz-Tool-Token ヘッダ (== process.env.BIZ_TOOL_TOKEN)。
// サイドカー作成時に lib/docker-session.ts から Env として注入されたトークンを
// tool が fetch ヘッダに乗せる。
//
// body:
//   { query: string, max_results?: number }   // 検索
//   { read_url: string }                      // 本文取得 (provider が対応していれば)

type RequestBody = {
  query?: string;
  max_results?: number;
  read_url?: string;
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

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }

  let provider;
  try {
    provider = getSearchProvider();
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 503 },
    );
  }

  // 本文取得モード
  if (typeof body.read_url === "string" && body.read_url.length > 0) {
    if (!provider.read) {
      return NextResponse.json(
        {
          error: `provider "${provider.name}" does not support read_url`,
        },
        { status: 400 },
      );
    }
    try {
      const result = await provider.read(body.read_url);
      return NextResponse.json({ provider: provider.name, ...result });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 502 },
      );
    }
  }

  // 検索モード
  if (typeof body.query !== "string" || body.query.trim().length === 0) {
    return NextResponse.json(
      { error: "query (string) is required" },
      { status: 400 },
    );
  }
  try {
    const hits = await provider.search(body.query, body.max_results);
    return NextResponse.json({ provider: provider.name, hits });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
