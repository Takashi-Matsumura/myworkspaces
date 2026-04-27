// Phase E-C-3: 署名付き共有 URL のヘルパ。
//
// - generateShareToken: URL-safe な乱数トークン (24 byte → base64url)。
// - resolveShareLink: token を受けて期限切れチェック付きで ShareLink を返す。
// - relativePath は ワークスペース内のみ (.. や絶対パス禁止)。

import { randomBytes } from "node:crypto";

export function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

// reports/foo.md / research/bar.md のような相対パスのみ許容。
// path traversal や絶対パスは弾く (path.join で workspace ROOT に乗せる前提)。
export function isSafeRelativePath(p: string): boolean {
  if (typeof p !== "string" || p.length === 0) return false;
  if (p.length > 256) return false;
  if (p.startsWith("/")) return false;
  if (p.includes("\0")) return false;
  if (p.split("/").some((s) => s === "..")) return false;
  return true;
}

export type ExpiryChoice = "7d" | "30d" | "never";

export function expiresAtFromChoice(choice: ExpiryChoice): Date | null {
  switch (choice) {
    case "7d":
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    case "never":
      return null;
  }
}

export function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}
