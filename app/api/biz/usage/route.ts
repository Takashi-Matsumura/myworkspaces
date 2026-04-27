import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { getUsageSnapshot } from "@/lib/biz/search-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase D-B: web_search の利用状況スナップショット。
// Tavily 等のプロバイダ自体は残量取得 API を提供していないため、自前で
// プロセス内のカウンタ (今月 / セッション / キャッシュヒット / 直近エラー) を
// 数えて UI に出す。プロセス再起動でリセットされる仕様。
//
// 設定画面の「ネットワーク」または「情報」タブからフェッチして表示する想定。

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const snapshot = getUsageSnapshot();
  const provider = (process.env.BIZ_SEARCH_PROVIDER ?? "tavily").toLowerCase();
  return NextResponse.json({
    provider,
    monthKey: snapshot.monthKey,
    monthCount: snapshot.monthCount,
    sessionCount: snapshot.sessionCount,
    cacheHitCount: snapshot.cacheHitCount,
    cacheSize: snapshot.cacheSize,
    lastErrorAt: snapshot.lastErrorAt,
    lastError: snapshot.lastError,
  });
}
