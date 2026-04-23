import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Next.js プロセス (ホスト上) から直接ホストの llama-server を叩く。
// Docker ネットワーク経由ではなく、素の localhost でよい。
const LLAMA_URL =
  process.env.LLAMA_SERVER_URL?.replace(/\/$/, "") ?? "http://localhost:8080";

// GET /api/opencode/llama-stats
// llama-server の /props から n_ctx (コンテキストウィンドウ) を取得する。
// session に依存しないので auth だけ通す。
export async function GET(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const resp = await fetch(`${LLAMA_URL}/props`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) {
      return NextResponse.json(
        { error: "props failed", status: resp.status },
        { status: 502 },
      );
    }
    const j = (await resp.json()) as {
      default_generation_settings?: { n_ctx?: number };
      model_alias?: string;
    };
    const contextWindow =
      j.default_generation_settings?.n_ctx ?? null;
    return NextResponse.json({
      contextWindow,
      model: j.model_alias ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "llama unreachable", detail: String(err) },
      { status: 502 },
    );
  }
}

// POST /api/opencode/llama-stats  body: { text }
// llama-server の /tokenize に text を投げてトークン数を返す。
// UI から会話文 or 応答全文を投げてトークン数 / コンテキスト利用率を計算する。
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!text) return NextResponse.json({ count: 0 });

  try {
    const resp = await fetch(`${LLAMA_URL}/tokenize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      return NextResponse.json(
        { error: "tokenize failed", status: resp.status },
        { status: 502 },
      );
    }
    const j = (await resp.json()) as { tokens?: unknown[] };
    const count = Array.isArray(j.tokens) ? j.tokens.length : 0;
    return NextResponse.json({ count });
  } catch (err) {
    return NextResponse.json(
      { error: "llama unreachable", detail: String(err) },
      { status: 502 },
    );
  }
}
