import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Phase E-B-2: sync-rag route の認証 / バリデーション / ヘルパ呼出を検証。
// `syncWorkspaceToRag` ヘルパは別レイヤなのでフルモックする (実 docker / Prisma に依存しない)。

const getUserSpy = vi.fn();
const syncSpy = vi.fn();

vi.mock("@/lib/user", () => ({
  getUser: (req: unknown) => getUserSpy(req),
}));

vi.mock("@/lib/biz/sync-rag", () => ({
  syncWorkspaceToRag: (sub: string, ws: string) => syncSpy(sub, ws),
}));

type RouteModule = typeof import("@/app/api/biz/sync-rag/route");

async function loadRoute(): Promise<RouteModule> {
  vi.resetModules();
  return await import("@/app/api/biz/sync-rag/route");
}

function makeReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/biz/sync-rag", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  getUserSpy.mockReset();
  syncSpy.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/biz/sync-rag — 認証", () => {
  it("Cookie 認証なしは 401", async () => {
    getUserSpy.mockResolvedValue(null);
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ workspaceId: "ws1" }));
    expect(resp.status).toBe(401);
    expect(syncSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/biz/sync-rag — バリデーション", () => {
  beforeEach(() => {
    getUserSpy.mockResolvedValue({ id: "user-1", username: "u" });
  });

  it("workspaceId なしは 400", async () => {
    const route = await loadRoute();
    const resp = await route.POST(makeReq({}));
    expect(resp.status).toBe(400);
    expect(syncSpy).not.toHaveBeenCalled();
  });

  it("workspaceId が空文字は 400", async () => {
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ workspaceId: "" }));
    expect(resp.status).toBe(400);
  });

  it("workspaceId が型違いは 400", async () => {
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ workspaceId: 123 }));
    expect(resp.status).toBe(400);
  });
});

describe("POST /api/biz/sync-rag — 中継", () => {
  beforeEach(() => {
    getUserSpy.mockResolvedValue({ id: "user-1", username: "u" });
  });

  it("正常系: ヘルパに sub と workspaceId を渡し結果をそのまま返す", async () => {
    const result = {
      synced: [{ id: "d1", relativePath: "reports/a.md", bytes: 100, chunkCount: 3, updated: false }],
      skipped: [],
      failed: [],
    };
    syncSpy.mockResolvedValue(result);
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ workspaceId: "ws-abc" }));
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual(result);
    expect(syncSpy).toHaveBeenCalledWith("user-1", "ws-abc");
  });

  it("対象 0 件のときも 200 で空配列を返す", async () => {
    syncSpy.mockResolvedValue({ synced: [], skipped: [], failed: [] });
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ workspaceId: "ws-empty" }));
    expect(resp.status).toBe(200);
    expect(await resp.json()).toEqual({ synced: [], skipped: [], failed: [] });
  });

  it("一部失敗があっても 200 (failed 配列で返す)", async () => {
    syncSpy.mockResolvedValue({
      synced: [{ id: "d1", relativePath: "reports/ok.md", bytes: 50, chunkCount: 2, updated: true }],
      skipped: [],
      failed: [{ relativePath: "reports/bad.md", error: "sidecar /ingest 502: ..." }],
    });
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ workspaceId: "ws1" }));
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.synced).toHaveLength(1);
    expect(json.failed).toHaveLength(1);
  });

  it("ヘルパが throw したら 500 + error メッセージ", async () => {
    syncSpy.mockRejectedValue(new Error("docker unreachable"));
    const route = await loadRoute();
    const resp = await route.POST(makeReq({ workspaceId: "ws1" }));
    expect(resp.status).toBe(500);
    const json = await resp.json();
    expect(json.error).toContain("docker unreachable");
  });
});
