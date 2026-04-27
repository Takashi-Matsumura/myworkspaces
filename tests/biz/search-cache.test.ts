import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// search-cache.ts はモジュールレベルにシングルトン (searchCache Map と usage オブジェクト) を
// 持つため、テスト間の状態漏れを防ぐために毎回 resetModules で再ロードする。
// 動的 import で取得するので、テスト本体で `loadModule()` を呼んでから API を使う。

type CacheModule = typeof import("@/lib/biz/search-cache");

async function loadModule(): Promise<CacheModule> {
  vi.resetModules();
  return await import("@/lib/biz/search-cache");
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cacheGet / cacheSet", () => {
  it("set した値を get で取り出せる (search)", async () => {
    const m = await loadModule();
    const body = { query: "foo", max_results: 5 };
    m.cacheSet("tavily", "search", body, { hits: ["a", "b"] });
    expect(m.cacheGet("tavily", "search", body)).toEqual({ hits: ["a", "b"] });
  });

  it("set した値を get で取り出せる (read)", async () => {
    const m = await loadModule();
    const body = { read_url: "https://example.com" };
    m.cacheSet("tavily", "read", body, { content: "x" });
    expect(m.cacheGet("tavily", "read", body)).toEqual({ content: "x" });
  });

  it("プロバイダが違えば別キーになる", async () => {
    const m = await loadModule();
    const body = { query: "foo" };
    m.cacheSet("tavily", "search", body, { p: "tavily" });
    expect(m.cacheGet("brave", "search", body)).toBeNull();
  });

  it("query は大文字小文字を無視して同一視 (max_results 違いは別キー)", async () => {
    const m = await loadModule();
    m.cacheSet("tavily", "search", { query: "FoO", max_results: 5 }, { p: 1 });
    // 大小無視 + trim
    expect(m.cacheGet("tavily", "search", { query: " foo ", max_results: 5 })).toEqual({ p: 1 });
    // max_results 違いは別キー
    expect(m.cacheGet("tavily", "search", { query: "foo", max_results: 10 })).toBeNull();
  });

  it("TTL 5 分で expire する", async () => {
    const m = await loadModule();
    m.cacheSet("tavily", "search", { query: "foo" }, { p: 1 });
    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    expect(m.cacheGet("tavily", "search", { query: "foo" })).toEqual({ p: 1 });
    vi.advanceTimersByTime(2);
    expect(m.cacheGet("tavily", "search", { query: "foo" })).toBeNull();
  });

  it("CACHE_MAX_ENTRIES (200) を超えたら最古エントリを 1 件削除", async () => {
    const m = await loadModule();
    // 200 件埋める
    for (let i = 0; i < 200; i++) {
      m.cacheSet("tavily", "search", { query: `q${i}` }, { i });
    }
    // 201 件目を追加 → q0 が evict されるはず
    m.cacheSet("tavily", "search", { query: "q200" }, { i: 200 });
    expect(m.cacheGet("tavily", "search", { query: "q0" })).toBeNull();
    expect(m.cacheGet("tavily", "search", { query: "q200" })).toEqual({ i: 200 });
    // 中間は残っている
    expect(m.cacheGet("tavily", "search", { query: "q100" })).toEqual({ i: 100 });
  });
});

describe("利用カウンタ", () => {
  it("recordApiCall で month / session カウントが増える", async () => {
    const m = await loadModule();
    expect(m.getUsageSnapshot().sessionCount).toBe(0);
    m.recordApiCall();
    m.recordApiCall();
    const snap = m.getUsageSnapshot();
    expect(snap.sessionCount).toBe(2);
    expect(snap.monthCount).toBe(2);
  });

  it("recordCacheHit は cacheHitCount のみ増える (sessionCount は変えない)", async () => {
    const m = await loadModule();
    m.recordCacheHit();
    m.recordCacheHit();
    const snap = m.getUsageSnapshot();
    expect(snap.cacheHitCount).toBe(2);
    expect(snap.sessionCount).toBe(0);
    expect(snap.monthCount).toBe(0);
  });

  it("recordError で lastError / lastErrorAt が記録される", async () => {
    const m = await loadModule();
    vi.setSystemTime(new Date("2026-04-27T12:00:00Z"));
    m.recordError("tavily search failed: 502");
    const snap = m.getUsageSnapshot();
    expect(snap.lastError).toBe("tavily search failed: 502");
    expect(snap.lastErrorAt).toBe(new Date("2026-04-27T12:00:00Z").getTime());
  });

  it("recordError は 200 文字で切り詰める", async () => {
    const m = await loadModule();
    const long = "x".repeat(500);
    m.recordError(long);
    expect(m.getUsageSnapshot().lastError?.length).toBe(200);
  });

  it("月が変わると monthCount だけリセットされる (sessionCount は維持)", async () => {
    vi.setSystemTime(new Date("2026-04-15T00:00:00Z"));
    const m = await loadModule();
    m.recordApiCall();
    m.recordApiCall();
    expect(m.getUsageSnapshot().monthCount).toBe(2);
    expect(m.getUsageSnapshot().monthKey).toBe("2026-04");

    // 翌月へ
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
    m.recordApiCall();
    const snap = m.getUsageSnapshot();
    expect(snap.monthKey).toBe("2026-05");
    expect(snap.monthCount).toBe(1);
    expect(snap.sessionCount).toBe(3); // 累計は維持
  });

  it("getUsageSnapshot は cacheSize を含む", async () => {
    const m = await loadModule();
    m.cacheSet("tavily", "search", { query: "a" }, { p: 1 });
    m.cacheSet("tavily", "search", { query: "b" }, { p: 2 });
    expect(m.getUsageSnapshot().cacheSize).toBe(2);
  });
});
