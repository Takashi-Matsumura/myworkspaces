import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/opencode/events — opencode サイドカーの /event (SSE) を透過中継する。
// クライアント (React) は new EventSource("/api/opencode/events") で購読。
//
// 設計メモ:
// - クライアントが切断したら AbortController で上流 fetch も止め、サイドカー側の
//   コネクションをリークさせない。
// - Response.body は上流の ReadableStream をそのまま渡す (pass-through)。
//   RAG サイドカーで aiter_raw による gzip 欠落問題があったが、ここは Next.js
//   ランタイムの fetch が decode 済みバイトを返すので心配なし。
// - x-accel-buffering: no は nginx リバースプロキシ下での buffer 抑止。Vercel /
//   ローカル直結でも無害なので常に付ける。
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ac = new AbortController();
  // クライアント切断を検知して上流にも伝播
  req.signal.addEventListener("abort", () => {
    ac.abort();
  });

  let upstream: Response;
  try {
    upstream = await fetchOpencode(user.id, "/event", {
      method: "GET",
      signal: ac.signal,
      headers: { accept: "text/event-stream" },
    });
  } catch (err) {
    if (ac.signal.aborted) {
      // クライアント側が即 close した (リロード等) の場合は通常経路
      return new NextResponse(null, { status: 499 });
    }
    console.error("[api/opencode/events] upstream fetch failed", err);
    return NextResponse.json(
      { error: "upstream unreachable" },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const body = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: "upstream failed", status: upstream.status, body },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
