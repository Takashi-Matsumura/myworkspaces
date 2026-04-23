import { getOpencodeServerUrl } from "./docker-session";

// opencode サイドカーへの fetch helper。サイドカー URL の解決 (inspect した
// HostPort の動的取得) と Basic 認証ヘッダの自動付与をまとめる。
// API route 側はこれを経由して opencode serve と対話する。
export async function fetchOpencode(
  sub: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const base = await getOpencodeServerUrl(sub);
  const url = `${base}${path}`;

  const headers = new Headers(init.headers);
  const password = process.env.OPENCODE_SERVER_PASSWORD ?? "";
  if (password && !headers.has("authorization")) {
    const token = Buffer.from(`opencode:${password}`).toString("base64");
    headers.set("authorization", `Basic ${token}`);
  }

  return fetch(url, { ...init, headers });
}

// 上流 (opencode サイドカー) からの Response をそのままクライアントに中継するユーティリティ。
// body をそのまま ReadableStream として流すので JSON / SSE 双方に使える。
// content-type は上流のヘッダをできる限り保存する。
export function relayResponse(upstream: Response, extraHeaders: HeadersInit = {}): Response {
  const headers = new Headers(extraHeaders);
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
