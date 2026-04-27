import { defineConfig } from "vitest/config";
import path from "node:path";

// Phase E-A: Biz パネル周りのユニットテスト/インテグレーションテスト基盤。
// 現状は lib/biz/* と app/api/biz/* を主対象とする。Next.js コンポーネント
// (React 19 + RSC) は jsdom セットアップが大掛かりなので Phase E-A の範囲外。
//
// node 環境で実行: search-cache / search-provider / web-search route は
// すべて Node-only のロジック。
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
    // Next.js の dev サーバや prisma の初期化と衝突しないよう、テストは独立プロセス
    isolate: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
