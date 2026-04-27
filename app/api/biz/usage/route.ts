import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { getUsageSnapshot } from "@/lib/biz/search-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Phase D-B / E-B-2: web_search + RAG ingest の利用状況スナップショット。
//
// - web_search 系 (今月 / セッション / キャッシュヒット / 直近エラー): プロセス内カウンタ
//   (Tavily 等は残量取得 API を提供していないため自前でカウント)。プロセス再起動で reset。
// - RAG ingest 系 (取り込み済み件数 / 最終 ingest 時刻): RagDocument テーブルから集計。
//   こちらは永続化された値。
//
// 設定画面の Biz タブが参照する。

export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const snapshot = getUsageSnapshot();
  const provider = (process.env.BIZ_SEARCH_PROVIDER ?? "tavily").toLowerCase();

  const ragCount = await prisma.ragDocument.count({ where: { userId: user.id } });
  const ragLatest = ragCount
    ? await prisma.ragDocument.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      })
    : null;

  return NextResponse.json({
    provider,
    monthKey: snapshot.monthKey,
    monthCount: snapshot.monthCount,
    sessionCount: snapshot.sessionCount,
    cacheHitCount: snapshot.cacheHitCount,
    cacheSize: snapshot.cacheSize,
    lastErrorAt: snapshot.lastErrorAt,
    lastError: snapshot.lastError,
    ragDocCount: ragCount,
    ragLastIngestAt: ragLatest?.updatedAt.getTime() ?? null,
  });
}
