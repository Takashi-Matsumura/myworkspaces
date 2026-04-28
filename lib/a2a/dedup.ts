// 直近 N 件の A2AMessage と SHA-256 で照合する dedup ヘルパ。
// 「Code が Biz の発言をオウム返しする → Biz もオウム返しする」のような
// 自己ループ対策。default N = 3。

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

export async function isDuplicate(
  ropeId: string,
  contentHash: string,
  recentN = 3,
): Promise<boolean> {
  const recent = await prisma.a2AMessage.findMany({
    where: { ropeId },
    orderBy: { createdAt: "desc" },
    take: recentN,
    select: { contentHash: true },
  });
  return recent.some((r) => r.contentHash === contentHash);
}
