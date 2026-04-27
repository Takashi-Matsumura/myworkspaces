import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expiresAtFromChoice,
  generateShareToken,
  isExpired,
  isSafeRelativePath,
} from "@/lib/biz/share";

// Phase E-C-3: 共有 URL ヘルパの軽量ユニットテスト。

describe("generateShareToken", () => {
  it("URL-safe な文字のみで構成される (base64url)", () => {
    for (let i = 0; i < 20; i++) {
      const t = generateShareToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t.length).toBeGreaterThanOrEqual(32);
    }
  });

  it("毎回異なるトークンを生成する", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(generateShareToken());
    expect(seen.size).toBe(100);
  });
});

describe("isSafeRelativePath", () => {
  it("通常の reports/research パスは OK", () => {
    expect(isSafeRelativePath("reports/foo.md")).toBe(true);
    expect(isSafeRelativePath("research/2026-ai-regulation.md")).toBe(true);
    expect(isSafeRelativePath("reports/sub/dir/file.md")).toBe(true);
  });

  it("空文字 / 絶対パス / .. を含むパスは拒否", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("/absolute/path.md")).toBe(false);
    expect(isSafeRelativePath("../../etc/passwd")).toBe(false);
    expect(isSafeRelativePath("reports/../secret.md")).toBe(false);
  });

  it("256 文字超は拒否", () => {
    expect(isSafeRelativePath("reports/" + "a".repeat(300) + ".md")).toBe(false);
  });

  it("\\0 を含むパスは拒否", () => {
    expect(isSafeRelativePath("reports/foo\0.md")).toBe(false);
  });
});

describe("expiresAtFromChoice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("7d は今から 7 日後", () => {
    const d = expiresAtFromChoice("7d");
    expect(d?.getTime()).toBe(new Date("2026-05-04T12:00:00Z").getTime());
  });

  it("30d は今から 30 日後", () => {
    const d = expiresAtFromChoice("30d");
    expect(d?.getTime()).toBe(new Date("2026-05-27T12:00:00Z").getTime());
  });

  it("never は null", () => {
    expect(expiresAtFromChoice("never")).toBeNull();
  });
});

describe("isExpired", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("null は期限切れではない (無期限)", () => {
    expect(isExpired(null)).toBe(false);
  });

  it("過去の日時は期限切れ", () => {
    expect(isExpired(new Date("2026-04-26T00:00:00Z"))).toBe(true);
  });

  it("未来の日時は期限切れではない", () => {
    expect(isExpired(new Date("2026-05-01T00:00:00Z"))).toBe(false);
  });
});
