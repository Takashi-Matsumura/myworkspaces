import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { getSearchProvider } from "@/lib/biz/search-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UI / 動作確認用の web_search エンドポイント。Cookie 認証 (= ログイン済ユーザのみ)。
// 内部 route (/api/biz/internal/web-search) と同じ provider を呼ぶが、
// 認証経路だけ違う。ブラウザの fetch から直接動作確認できる。

type RequestBody = {
  query?: string;
  max_results?: number;
  read_url?: string;
};

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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

  if (typeof body.read_url === "string" && body.read_url.length > 0) {
    if (!provider.read) {
      return NextResponse.json(
        { error: `provider "${provider.name}" does not support read_url` },
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
