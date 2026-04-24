import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode, relayResponse } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/opencode/sessions/{id}/prompt — 非同期メッセージ送信 (204 即 return)
// body: {
//   "parts": [{"type":"text","text":"..."}],
//   "variant"?: "coding" | "business",   // Coding UI 経由か識別
//   "agent"?: "plan" | "build",           // opencode 組み込みエージェント選択
//   ...
// }
// 結果は /api/opencode/events の SSE を購読して message.part.delta 等で受ける
//
// - variant === "coding" の場合、parts[0].text の先頭にコード生成時の注意喚起を
//   付加 (Stage 2)
// - agent が "plan" | "build" の場合、opencode の組み込みエージェントに振り分け
//   (Stage 3)。plan は edit を `.opencode/plans/*.md` のみに制限する組み込み設定が
//   あるので、計画文書だけを書かせる用途に使える
const CODING_PREFIX =
  "[coding-rules.md に従って作業すること。ファイルは write/edit ツールを実際に呼んで書き込み、最後に bash で動作確認を行うまで完了宣言しない]\n\n";

const ALLOWED_AGENTS = new Set(["plan", "build"]);

function transformBody(raw: string): string {
  try {
    const body = JSON.parse(raw) as {
      parts?: Array<{ type?: string; text?: string }>;
      variant?: string;
      agent?: string;
      [k: string]: unknown;
    };

    // variant に応じて coding prefix を付加
    if (
      body.variant === "coding" &&
      Array.isArray(body.parts) &&
      body.parts.length > 0
    ) {
      const first = body.parts[0];
      if (
        first &&
        first.type === "text" &&
        typeof first.text === "string" &&
        !first.text.startsWith(CODING_PREFIX)
      ) {
        first.text = CODING_PREFIX + first.text;
      }
    }
    delete body.variant;

    // agent は許可リストにあるものだけ転送。不正値は silently drop
    if (body.agent && !ALLOWED_AGENTS.has(body.agent)) {
      delete body.agent;
    }

    return JSON.stringify(body);
  } catch {
    // parse 失敗時は素通し (opencode 側のエラーに任せる)
    return raw;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const raw = await req.text();
  const body = transformBody(raw);
  const upstream = await fetchOpencode(
    user.id,
    `/session/${encodeURIComponent(id)}/prompt_async`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    },
  );
  return relayResponse(upstream);
}
