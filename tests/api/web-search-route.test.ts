import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Phase E-A: 内部 web-search route の cache 統合とカウンタ計上をブラックボックスで検証。
// search-provider をフルモックし、route が cache miss → provider.search → recordApiCall、
// cache hit → provider.search を呼ばない、というシナリオを確認する。

type RouteModule = typeof import("@/app/api/biz/internal/web-search/route");
type CacheModule = typeof import("@/lib/biz/search-cache");

const searchSpy = vi.fn();
const readSpy = vi.fn();

vi.mock("@/lib/biz/search-provider", () => ({
  getSearchProvider: () => ({
    name: "tavily",
    search: searchSpy,
    read: readSpy,
  }),
  getFallbackReader: () => null,
}));

async function loadRoute(): Promise<{ route: RouteModule; cache: CacheModule }> {
  vi.resetModules();
  const route = await import("@/app/api/biz/internal/web-search/route");
  const cache = await import("@/lib/biz/search-cache");
  return { route, cache };
}

function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost/api/biz/internal/web-search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  searchSpy.mockReset();
  readSpy.mockReset();
  process.env.BIZ_TOOL_TOKEN = "test-token";
});

afterEach(() => {
  delete process.env.BIZ_TOOL_TOKEN;
});

describe("POST /api/biz/internal/web-search — 認証", () => {
  it("BIZ_TOOL_TOKEN 未設定なら 503", async () => {
    delete process.env.BIZ_TOOL_TOKEN;
    const { route } = await loadRoute();
    const resp = await route.POST(makeReq({ query: "foo" }));
    expect(resp.status).toBe(503);
  });

  it("X-Biz-Tool-Token ヘッダなしは 401", async () => {
    const { route } = await loadRoute();
    const resp = await route.POST(makeReq({ query: "foo" }));
    expect(resp.status).toBe(401);
  });

  it("X-Biz-Tool-Token が一致しないと 401", async () => {
    const { route } = await loadRoute();
    const resp = await route.POST(
      makeReq({ query: "foo" }, { "x-biz-tool-token": "wrong" }),
    );
    expect(resp.status).toBe(401);
  });
});

describe("POST /api/biz/internal/web-search — 検索 + cache", () => {
  it("query を渡すと provider.search を呼んで hits を返し、recordApiCall される", async () => {
    const { route, cache } = await loadRoute();
    searchSpy.mockResolvedValue([{ title: "T", url: "https://x", snippet: "s" }]);
    const before = cache.getUsageSnapshot().sessionCount;

    const resp = await route.POST(
      makeReq({ query: "foo" }, { "x-biz-tool-token": "test-token" }),
    );
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.provider).toBe("tavily");
    expect(json.cached).toBe(false);
    expect(json.hits).toHaveLength(1);
    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(cache.getUsageSnapshot().sessionCount).toBe(before + 1);
  });

  it("同一クエリの 2 回目は cache hit で provider.search を呼ばず、cacheHitCount が +1", async () => {
    const { route, cache } = await loadRoute();
    searchSpy.mockResolvedValue([{ title: "T", url: "https://x", snippet: "s" }]);

    await route.POST(
      makeReq({ query: "bar" }, { "x-biz-tool-token": "test-token" }),
    );
    expect(searchSpy).toHaveBeenCalledTimes(1);
    const apiCallsAfterFirst = cache.getUsageSnapshot().sessionCount;
    const cacheHitsBefore = cache.getUsageSnapshot().cacheHitCount;

    const resp2 = await route.POST(
      makeReq({ query: "bar" }, { "x-biz-tool-token": "test-token" }),
    );
    expect(resp2.status).toBe(200);
    expect(searchSpy).toHaveBeenCalledTimes(1); // 増えていない
    const snap = cache.getUsageSnapshot();
    expect(snap.sessionCount).toBe(apiCallsAfterFirst); // 増えていない
    expect(snap.cacheHitCount).toBe(cacheHitsBefore + 1);
  });

  it("provider.search が throw したら 502 + recordError", async () => {
    const { route, cache } = await loadRoute();
    searchSpy.mockRejectedValue(new Error("tavily search failed: 502"));

    const resp = await route.POST(
      makeReq({ query: "boom" }, { "x-biz-tool-token": "test-token" }),
    );
    expect(resp.status).toBe(502);
    expect(cache.getUsageSnapshot().lastError).toContain("tavily search failed: 502");
  });

  it("query 空は 400 (provider は呼ばない)", async () => {
    const { route } = await loadRoute();
    const resp = await route.POST(
      makeReq({ query: "" }, { "x-biz-tool-token": "test-token" }),
    );
    expect(resp.status).toBe(400);
    expect(searchSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/biz/internal/web-search — read_url + cache", () => {
  it("read_url を渡すと provider.read を呼んで content を返す", async () => {
    const { route, cache } = await loadRoute();
    readSpy.mockResolvedValue({
      title: "Page",
      url: "https://x",
      content: "body",
    });
    const before = cache.getUsageSnapshot().sessionCount;

    const resp = await route.POST(
      makeReq(
        { read_url: "https://x" },
        { "x-biz-tool-token": "test-token" },
      ),
    );
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.content).toBe("body");
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(cache.getUsageSnapshot().sessionCount).toBe(before + 1);
  });

  it("同一 URL の 2 回目は cache hit で provider.read を呼ばない", async () => {
    const { route, cache } = await loadRoute();
    readSpy.mockResolvedValue({ title: "Page", url: "https://y", content: "body" });
    await route.POST(
      makeReq(
        { read_url: "https://y" },
        { "x-biz-tool-token": "test-token" },
      ),
    );
    const cacheHitsBefore = cache.getUsageSnapshot().cacheHitCount;
    const resp2 = await route.POST(
      makeReq(
        { read_url: "https://y" },
        { "x-biz-tool-token": "test-token" },
      ),
    );
    expect(resp2.status).toBe(200);
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(cache.getUsageSnapshot().cacheHitCount).toBe(cacheHitsBefore + 1);
  });
});
