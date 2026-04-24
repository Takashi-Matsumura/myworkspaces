import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode, relayResponse } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/opencode/sessions/{id}/prompt — 非同期メッセージ送信 (204 即 return)
// body: { "parts": [{"type":"text","text":"..."}], "variant"?: "coding" | "business", ... }
// 結果は /api/opencode/events の SSE を購読して message.part.delta 等で受ける
//
// variant === "coding" の場合、parts[0].text の先頭にコード生成時の注意喚起を
// 付加してから opencode へ中継する (ユーザーが生プロンプトを送った場合の
// 最低限の priming。テンプレート経由の場合はテンプレ本文が既に手順を含んでいる)。
const CODING_PREFIX =
  "[coding-rules.md に従って作業すること。ファイルは write/edit ツールを実際に呼んで書き込み、最後に bash で動作確認を行うまで完了宣言しない]\n\n";

function injectCodingPrefix(raw: string): string {
  try {
    const body = JSON.parse(raw) as {
      parts?: Array<{ type?: string; text?: string }>;
      variant?: string;
      [k: string]: unknown;
    };
    if (body.variant !== "coding") return raw;
    if (!Array.isArray(body.parts) || body.parts.length === 0) return raw;
    const first = body.parts[0];
    if (!first || first.type !== "text" || typeof first.text !== "string") {
      return raw;
    }
    // 既に prefix が付いていたら二重付与しない
    if (first.text.startsWith(CODING_PREFIX)) return raw;
    first.text = CODING_PREFIX + first.text;
    // variant は opencode 側に渡しても害は無いが、意味のない追加フィールドは
    // 外しておくほうが API 契約として綺麗
    delete body.variant;
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
  const body = injectCodingPrefix(raw);
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
