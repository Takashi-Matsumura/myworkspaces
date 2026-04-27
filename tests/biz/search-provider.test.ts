import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry, RETRY_BACKOFF_MS } from "@/lib/biz/search-provider";

// fetchWithRetry のリトライ判定:
//   - 200 OK / 4xx / 500 → そのまま返す (リトライしない)
//   - 501 / 502 / 503     → 1 度だけリトライして 2 回目の結果を返す

function mockResponse(status: number, body = ""): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function runWithFakeFetch(
  responses: Response[],
  fn: () => Promise<Response>,
): Promise<{ result: Response; calls: number }> {
  let i = 0;
  const fetchSpy = vi.fn(async () => {
    const resp = responses[i] ?? responses[responses.length - 1];
    i += 1;
    return resp;
  });
  vi.stubGlobal("fetch", fetchSpy);
  const promise = fn();
  // バックオフタイマを進める
  await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS + 10);
  const result = await promise;
  return { result, calls: fetchSpy.mock.calls.length };
}

describe("fetchWithRetry", () => {
  it("200 OK ならリトライせずそのまま返す", async () => {
    const { result, calls } = await runWithFakeFetch(
      [mockResponse(200, "ok")],
      () => fetchWithRetry("https://x.example/"),
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(1);
  });

  it("400 はリトライしない (リクエストエラー)", async () => {
    const { result, calls } = await runWithFakeFetch(
      [mockResponse(400)],
      () => fetchWithRetry("https://x.example/"),
    );
    expect(result.status).toBe(400);
    expect(calls).toBe(1);
  });

  it("403 はリトライしない (権限エラー)", async () => {
    const { result, calls } = await runWithFakeFetch(
      [mockResponse(403)],
      () => fetchWithRetry("https://x.example/"),
    );
    expect(result.status).toBe(403);
    expect(calls).toBe(1);
  });

  it("500 はリトライしない (サーバ側の決定的エラー扱い)", async () => {
    const { result, calls } = await runWithFakeFetch(
      [mockResponse(500)],
      () => fetchWithRetry("https://x.example/"),
    );
    expect(result.status).toBe(500);
    expect(calls).toBe(1);
  });

  it("501 → 200 で 2 回呼ばれて成功する", async () => {
    const { result, calls } = await runWithFakeFetch(
      [mockResponse(501), mockResponse(200, "ok")],
      () => fetchWithRetry("https://x.example/"),
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("502 → 200 で 2 回呼ばれて成功する", async () => {
    const { result, calls } = await runWithFakeFetch(
      [mockResponse(502), mockResponse(200, "ok")],
      () => fetchWithRetry("https://x.example/"),
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("503 → 200 で 2 回呼ばれて成功する", async () => {
    const { result, calls } = await runWithFakeFetch(
      [mockResponse(503), mockResponse(200, "ok")],
      () => fetchWithRetry("https://x.example/"),
    );
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("502 → 502 でも 2 回までしか呼ばない (1 度だけリトライ)", async () => {
    const { result, calls } = await runWithFakeFetch(
      [mockResponse(502), mockResponse(502)],
      () => fetchWithRetry("https://x.example/"),
    );
    expect(result.status).toBe(502);
    expect(calls).toBe(2);
  });

  it("init (method/headers/body) を 2 回目の fetch にも渡す", async () => {
    const fetchSpy = vi.fn(async (_url: unknown, init?: RequestInit) => {
      return fetchSpy.mock.calls.length === 1
        ? mockResponse(503)
        : mockResponse(200, init?.body as string);
    });
    vi.stubGlobal("fetch", fetchSpy);
    const promise = fetchWithRetry("https://x.example/", {
      method: "POST",
      headers: { "x-test": "1" },
      body: "payload",
    });
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS + 10);
    const result = await promise;
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("payload");
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: { "x-test": "1" },
      body: "payload",
    });
  });

  it("バックオフ間隔 (600ms) を空けてからリトライする", async () => {
    let firstCalledAt = 0;
    let secondCalledAt = 0;
    const fetchSpy = vi.fn(async () => {
      if (fetchSpy.mock.calls.length === 1) {
        firstCalledAt = Date.now();
        return mockResponse(502);
      }
      secondCalledAt = Date.now();
      return mockResponse(200, "ok");
    });
    vi.stubGlobal("fetch", fetchSpy);
    vi.setSystemTime(new Date("2026-04-27T00:00:00Z"));
    const promise = fetchWithRetry("https://x.example/");
    await vi.advanceTimersByTimeAsync(RETRY_BACKOFF_MS + 10);
    await promise;
    expect(secondCalledAt - firstCalledAt).toBeGreaterThanOrEqual(RETRY_BACKOFF_MS);
  });
});
