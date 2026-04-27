import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// Phase E-C-3: /api/biz/share (POST/GET) と /api/share/[token] (GET) を
// Prisma + getUser + readFile を全てモックして検証する。

const getUserSpy = vi.fn();

// prisma の chainable な mock を作るのは大変なので、必要なメソッドだけ vi.fn でスタブ
const workspaceFindUnique = vi.fn();
const shareLinkFindUnique = vi.fn();
const shareLinkCreate = vi.fn();
const shareLinkUpdate = vi.fn();
const shareLinkFindMany = vi.fn();

vi.mock("@/lib/user", () => ({
  getUser: (req: unknown) => getUserSpy(req),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace: { findUnique: workspaceFindUnique },
    shareLink: {
      findUnique: shareLinkFindUnique,
      create: shareLinkCreate,
      update: shareLinkUpdate,
      findMany: shareLinkFindMany,
    },
  },
}));

const readFileSpy = vi.fn();
vi.mock("@/lib/workspace", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    readFile: (sub: string, path: string) => readFileSpy(sub, path),
  };
});

type CreateRouteModule = typeof import("@/app/api/biz/share/route");
type PublicRouteModule = typeof import("@/app/api/share/[token]/route");

async function loadCreateRoute(): Promise<CreateRouteModule> {
  vi.resetModules();
  return await import("@/app/api/biz/share/route");
}

async function loadPublicRoute(): Promise<PublicRouteModule> {
  vi.resetModules();
  return await import("@/app/api/share/[token]/route");
}

function makeReq(body: unknown, method = "POST"): NextRequest {
  return new Request("http://localhost/api/biz/share", {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  getUserSpy.mockReset();
  workspaceFindUnique.mockReset();
  shareLinkFindUnique.mockReset();
  shareLinkCreate.mockReset();
  shareLinkUpdate.mockReset();
  shareLinkFindMany.mockReset();
  readFileSpy.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/biz/share", () => {
  beforeEach(() => {
    getUserSpy.mockResolvedValue({ id: "user-1", username: "u" });
    workspaceFindUnique.mockResolvedValue({ userId: "user-1" });
  });

  it("認証なしは 401", async () => {
    getUserSpy.mockResolvedValue(null);
    const m = await loadCreateRoute();
    const resp = await m.POST(makeReq({ workspaceId: "ws", relativePath: "reports/a.md" }));
    expect(resp.status).toBe(401);
  });

  it("workspaceId なしは 400", async () => {
    const m = await loadCreateRoute();
    const resp = await m.POST(makeReq({ relativePath: "reports/a.md" }));
    expect(resp.status).toBe(400);
  });

  it("relativePath が unsafe (../ 含む) は 400", async () => {
    const m = await loadCreateRoute();
    const resp = await m.POST(
      makeReq({ workspaceId: "ws", relativePath: "../etc/passwd" }),
    );
    expect(resp.status).toBe(400);
  });

  it("Workspace が他人のものなら 404", async () => {
    workspaceFindUnique.mockResolvedValue({ userId: "other-user" });
    const m = await loadCreateRoute();
    const resp = await m.POST(
      makeReq({ workspaceId: "ws", relativePath: "reports/a.md" }),
    );
    expect(resp.status).toBe(404);
  });

  it("新規発行: shareLink.create が呼ばれて token を返す", async () => {
    shareLinkFindUnique.mockResolvedValue(null);
    shareLinkCreate.mockResolvedValue({
      token: "tok-abc",
      workspaceId: "ws",
      relativePath: "reports/a.md",
      expiresAt: new Date("2026-05-04T00:00:00Z"),
      createdAt: new Date("2026-04-27T00:00:00Z"),
      updatedAt: new Date("2026-04-27T00:00:00Z"),
    });
    const m = await loadCreateRoute();
    const resp = await m.POST(
      makeReq({ workspaceId: "ws", relativePath: "reports/a.md", expiry: "7d" }),
    );
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.token).toBe("tok-abc");
    expect(shareLinkCreate).toHaveBeenCalledTimes(1);
    expect(shareLinkUpdate).not.toHaveBeenCalled();
  });

  it("既存ありの再発行: token は維持して expiresAt のみ更新", async () => {
    shareLinkFindUnique.mockResolvedValue({
      id: "link-1",
      token: "tok-xyz",
    });
    shareLinkUpdate.mockResolvedValue({
      token: "tok-xyz",
      workspaceId: "ws",
      relativePath: "reports/a.md",
      expiresAt: new Date("2026-05-27T00:00:00Z"),
      createdAt: new Date("2026-04-20T00:00:00Z"),
      updatedAt: new Date("2026-04-27T00:00:00Z"),
    });
    const m = await loadCreateRoute();
    const resp = await m.POST(
      makeReq({ workspaceId: "ws", relativePath: "reports/a.md", expiry: "30d" }),
    );
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.token).toBe("tok-xyz"); // 元の token のまま
    expect(shareLinkCreate).not.toHaveBeenCalled();
    expect(shareLinkUpdate).toHaveBeenCalledTimes(1);
  });

  it("expiry: never は expiresAt: null", async () => {
    shareLinkFindUnique.mockResolvedValue(null);
    shareLinkCreate.mockImplementation(async (args: { data: { expiresAt: Date | null } }) => ({
      token: "tok",
      workspaceId: "ws",
      relativePath: "reports/a.md",
      expiresAt: args.data.expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const m = await loadCreateRoute();
    const resp = await m.POST(
      makeReq({ workspaceId: "ws", relativePath: "reports/a.md", expiry: "never" }),
    );
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.expiresAt).toBeNull();
  });
});

describe("GET /api/biz/share", () => {
  it("認証なしは 401", async () => {
    getUserSpy.mockResolvedValue(null);
    const m = await loadCreateRoute();
    const resp = await m.GET(makeReq({}, "GET"));
    expect(resp.status).toBe(401);
  });

  it("自分の発行済み一覧を返す", async () => {
    getUserSpy.mockResolvedValue({ id: "user-1", username: "u" });
    shareLinkFindMany.mockResolvedValue([
      {
        token: "t1",
        workspaceId: "ws",
        relativePath: "reports/a.md",
        expiresAt: null,
        createdAt: new Date("2026-04-20T00:00:00Z"),
        updatedAt: new Date("2026-04-27T00:00:00Z"),
      },
    ]);
    const m = await loadCreateRoute();
    const resp = await m.GET(makeReq({}, "GET"));
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.links).toHaveLength(1);
    expect(json.links[0].token).toBe("t1");
    expect(shareLinkFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
  });
});

describe("GET /api/share/[token] (公開)", () => {
  function makePublicReq(): NextRequest {
    return new Request("http://localhost/api/share/some", {
      method: "GET",
    }) as unknown as NextRequest;
  }

  it("未知 token は 404", async () => {
    shareLinkFindUnique.mockResolvedValue(null);
    const m = await loadPublicRoute();
    const resp = await m.GET(makePublicReq(), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(resp.status).toBe(404);
  });

  it("期限切れは 410 Gone", async () => {
    shareLinkFindUnique.mockResolvedValue({
      userId: "u",
      workspaceId: "ws",
      relativePath: "reports/a.md",
      expiresAt: new Date(Date.now() - 86400_000),
      createdAt: new Date(),
    });
    const m = await loadPublicRoute();
    const resp = await m.GET(makePublicReq(), {
      params: Promise.resolve({ token: "expired" }),
    });
    expect(resp.status).toBe(410);
  });

  it("有効ならファイル内容を返す", async () => {
    shareLinkFindUnique.mockResolvedValue({
      userId: "u",
      workspaceId: "ws",
      relativePath: "reports/a.md",
      expiresAt: null,
      createdAt: new Date("2026-04-20T00:00:00Z"),
    });
    readFileSpy.mockResolvedValue({
      path: "/root/workspaces/ws/reports/a.md",
      size: 100,
      truncated: false,
      content: "# Hello",
    });
    const m = await loadPublicRoute();
    const resp = await m.GET(makePublicReq(), {
      params: Promise.resolve({ token: "tok" }),
    });
    expect(resp.status).toBe(200);
    const json = await resp.json();
    expect(json.content).toBe("# Hello");
    expect(json.relativePath).toBe("reports/a.md");
    expect(readFileSpy).toHaveBeenCalledWith("u", "/root/workspaces/ws/reports/a.md");
  });
});
