import type { IncomingMessage } from "node:http";

export type UserIdentity = { sub: string };

const DEMO_SUB = "demo";

// 認証なしの簡易版。将来 OIDC / Cookie セッションに差し替えやすいよう、
// sub の取得はここ 1 箇所に集約する。
// 呼び出し側は Next.js の Request と Node の IncomingMessage の両方から
// 使うので、引数を省略可能にしている。
export function getSub(req?: Request | IncomingMessage): string {
  // 将来 OIDC / Cookie セッションに差し替える箇所。現状は req を見ない。
  void req;
  return process.env.DEMO_SUB ?? DEMO_SUB;
}

export function getIdentity(req?: Request | IncomingMessage): UserIdentity {
  return { sub: getSub(req) };
}

export function sanitizeSub(sub: string): string {
  return sub.replace(/[^a-zA-Z0-9_-]/g, "_");
}
