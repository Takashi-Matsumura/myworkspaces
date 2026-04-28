import { defineConfig } from "vitest/config";
import path from "node:path";

// Phase E-A / F-F: Biz パネル周りのユニット / インテグレーションテスト基盤。
//
// Vitest の "projects" でテストを 2 系統に分ける:
//   - node 環境: lib/biz/* + app/api/* (純粋ロジック / API route)
//   - jsdom 環境: app/demo/components/* + app/biz/* (React コンポーネント)
//
// node 系は dotenv / Prisma / fetch が絡むので環境を汚さない isolate モード、
// jsdom 系は React / DOM API + @testing-library が要るので別プロジェクト。
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "tests/biz/**/*.test.ts",
            "tests/api/**/*.test.ts",
            "tests/a2a/**/*.test.ts",
          ],
          isolate: true,
          globals: false,
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["tests/components/**/*.test.{ts,tsx}"],
          setupFiles: ["./tests/setup-rtl.ts"],
          globals: false,
        },
      },
    ],
  },
});
