import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Phase E-B-1: 内部 recall route の認証 + sidecar 中継 + エラーハンドリングを
// ブラックボックスで検証。`getRagSidecarUrl` と `fetch` をモックする。

const ragSidecarUrlSpy = vi.fn();

vi.mock("@/lib/docker-session", () => ({
  getRagSidecarUrl: (sub: string) => ragSidecarUrlSpy(sub),
}));

type RouteModule = typeof import("@/app/api/biz/internal/recall/route");

async function loadRoute(): Promise<RouteModule> {
  vi.resetModules();
  return await import("@/app/api/biz/internal/recall/route");
}

function makeReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new Request("http://localhost/api/biz/internal/recall", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const VALID_HEADERS = {
  "x-biz-tool-token": "test-token",
  "x-myworkspaces-sub": "user-abc",
};

beforeEach(() => {
  ragSidecarUrlSpy.mockReset();
  process.env.BIZ_TOOL_TOKEN = "test-token";
});

afterEach(() => {
  delete process.env.BIZ_TOOL_TOKEN;
  vi.unstubAllGlobals();
});

describe("POST /api/biz/internal/recall — 認証", () => {
  it("BIZ_TOOL_TOKEN 未設定なら 503", async () => {
    delete process.env.BIZ_TOOL_TOKEN;
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ query: "foo" }, VALID_HEADERS));
    expect(resp.status).toBe(503);
  });

  it("X-Biz-Tool-Token なしは 401", async () => {
    const route = await loadRoute();
    const resp = await route.POST(
      makeReq({ query: "foo" }, { "x-myworkspaces-sub": "user-abc" }),
    );
    expect(resp.status).toBe(401);
  });

  it("X-Biz-Tool-Token 不一致は 401", async () => {
    const route = await loadRoute();
    const resp = await route.POST(
      makeReq(
        { query: "foo" },
        { "x-biz-tool-token": "wrong", "x-myworkspaces-sub": "user-abc" },
      ),
    );
    expect(resp.status).toBe(401);
  });

  it("X-MyWorkspaces-Sub なしは 401", async () => {
    const route = await loadRoute();
    const resp = await route.POST(
      makeReq({ query: "foo" }, { "x-biz-tool-token": "test-token" }),
    );
    expect(resp.status).toBe(401);
  });
});

describe("POST /api/biz/internal/recall — 中継", () => {
  it("query 空は 400 (sidecar は呼ばない)", async () => {
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ query: "" }, VALID_HEADERS));
    expect(resp.status).toBe(400);
    expect(ragSidecarUrlSpy).not.toHaveBeenCalled();
  });

  it("getRagSidecarUrl が throw したら 503", async () => {
    ragSidecarUrlSpy.mockRejectedValue(new Error("docker unreachable"));
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ query: "foo" }, VALID_HEADERS));
    expect(resp.status).toBe(503);
    const json = await resp.json();
    expect(json.error).toContain("rag sidecar unavailable");
  });

  it("sidecar が hits を返したらそのまま転送", async () => {
    ragSidecarUrlSpy.mockResolvedValue("http://127.0.0.1:9090");
    const fetchSpy = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          hits: [
            { doc_id: "d1", filename: "report.md", chunk_index: 0, text: "...", score: 0.9 },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const route = await loadRoute();
    const resp = await route.POST(makeReq({ query: "foo" }, VALID_HEADERS));
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.hits).toHaveLength(1);
    expect(json.hits[0].filename).toBe("report.md");

    // sub が getRagSidecarUrl に渡される
    expect(ragSidecarUrlSpy).toHaveBeenCalledWith("user-abc");
    // sidecar の /search に POST される
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:9090/search");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      query: "foo",
      top_k: undefined,
    });
  });

  it("top_k を指定すると sidecar に転送される", async () => {
    ragSidecarUrlSpy.mockResolvedValue("http://127.0.0.1:9090");
    const fetchSpy = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ hits: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const route = await loadRoute();
    await route.POST(makeReq({ query: "foo", top_k: 8 }, VALID_HEADERS));
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string)).toEqual({
      query: "foo",
      top_k: 8,
    });
  });

  it("hits フィールドが無いレスポンスは [] で返す", async () => {
    ragSidecarUrlSpy.mockResolvedValue("http://127.0.0.1:9090");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    const route = await loadRoute();
    const resp = await route.POST(makeReq({ query: "foo" }, VALID_HEADERS));
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ hits: [] });
  });

  it("sidecar が 502 を返したら 502 + error メッセージ", async () => {
    ragSidecarUrlSpy.mockResolvedValue("http://127.0.0.1:9090");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "embedding failed" }), {
            status: 502,
          }),
      ),
    );

    const route = await loadRoute();
    const resp = await route.POST(makeReq({ query: "foo" }, VALID_HEADERS));
    expect(resp.status).toBe(502);
    const json = await resp.json();
    expect(json.error).toContain("rag /search HTTP 502");
    expect(json.error).toContain("embedding failed");
  });

  it("fetch 自体が throw したら 502", async () => {
    ragSidecarUrlSpy.mockResolvedValue("http://127.0.0.1:9090");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const route = await loadRoute();
    const resp = await route.POST(makeReq({ query: "foo" }, VALID_HEADERS));
    expect(resp.status).toBe(502);
    const json = await resp.json();
    expect(json.error).toContain("rag /search fetch failed");
    expect(json.error).toContain("ECONNREFUSED");
  });
});
