import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 はアダプタ必須。next dev の HMR で接続がリークしないよう
// グローバルにキャッシュする (開発時のみ)。
declare global {
  var __prisma__: PrismaClient | undefined;
}

function create(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = global.__prisma__ ?? create();

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}
