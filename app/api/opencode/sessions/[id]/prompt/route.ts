import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/user";
import { fetchOpencode, relayResponse } from "@/lib/opencode-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/opencode/sessions/{id}/prompt — 非同期メッセージ送信 (204 即 return)
// body: {
//   "parts": [{"type":"text","text":"..."}],
//   "variant"?: "coding" | "business" | "analyze",   // 呼び出し元 UI 識別
//   "agent"?: "plan" | "build",                       // opencode 組み込みエージェント選択
//   "mode"?: "survey" | "detail" | "port",            // Analyze パネルの分析フェーズ
//   ...
// }
// 結果は /api/opencode/events の SSE を購読して message.part.delta 等で受ける
//
// - variant === "coding" の場合、parts[0].text の先頭にコード生成時の注意喚起を
//   付加 (Stage 2)
// - variant === "analyze" の場合、mode に応じて分析フェーズ別 prefix を付加
// - variant === "business" の場合、mode (BizPhase) に応じてビジネス分析 prefix を付加
// - agent が "plan" | "build" の場合、opencode の組み込みエージェントに振り分け
//   (Stage 3)。plan は edit を `.opencode/plans/*.md` のみに制限する組み込み設定が
//   あるので、計画文書だけを書かせる用途に使える
const CODING_PREFIX =
  "[coding-rules.md に従って作業すること。ファイルは write/edit ツールを実際に呼んで書き込み、最後に bash で動作確認を行うまで完了宣言しない]\n\n";

const ANALYZE_PREFIXES: Record<"survey" | "detail" | "port", string> = {
  survey:
    "[analyze-rules.md に従って repo 構造把握フェーズで動くこと。bash と read を中心に使い、出力は docs/analysis/00-overview.md。実装ファイルは write/edit で書き換えない]\n\n",
  detail:
    "[analyze-rules.md に従って詳細分析フェーズで動くこと。クラス・関数・API・データモデルを docs/analysis/ 配下の連番 .md (10-modules.md / 20-api.md / 30-data-model.md など) に書き出すこと。各記述に出典 (path:line) を併記。実装ファイルは write/edit で書き換えない]\n\n",
  port:
    "[analyze-rules.md に従って移植ガイドフェーズで動くこと。docs/analysis/ 配下の既存資料 (00-overview.md / 10-modules.md / 20-api.md / 30-data-model.md など) を read で読み込み、別言語の再実装エージェント向けの引き継ぎ書 docs/analysis/90-porting-guide.md を生成する。実装ファイルは write/edit で書き換えない]\n\n",
};

// Biz パネルのフェーズ別 prefix。Web フェーズの web_search は Phase B で実装予定。
const BIZ_PREFIXES: Record<"data" | "doc" | "web" | "synth", string> = {
  data:
    "[business-rules.md に従って Data フェーズで動作すること。@inputs/ 配下の CSV/XLSX を read_excel で読み、reports/data-<topic>.md にサマリと KPI 表を書く。実装ファイルは write/edit で書き換えない]\n\n",
  doc:
    "[business-rules.md に従って Doc フェーズで動作すること。@inputs/ 配下の PDF を read_pdf、画像を describe_image で読み、reports/doc-<topic>.md に要約と引用 (page) を書く。実装ファイルは write/edit で書き換えない]\n\n",
  web:
    "[business-rules.md に従って Web フェーズで動作すること。web_search ツールで多段検索し research/<slug>.md に引用 URL を蓄積する (1 ターン最大 5 クエリ、本文取得は 2 件まで、引用 3 件以上必須)。実装ファイルは write/edit で書き換えない]\n\n",
  synth:
    "[business-rules.md に従って Synthesize フェーズで動作すること。reports/ と research/ 配下を read で読み、reports/<topic>-summary.md に Data/Doc/Web 三面ビューと統合インサイト・矛盾点を書く。実装ファイルは write/edit で書き換えない]\n\n",
};

const ALLOWED_AGENTS = new Set(["plan", "build"]);
const ALLOWED_ANALYZE_MODES = new Set(["survey", "detail", "port"]);
const ALLOWED_BIZ_PHASES = new Set(["data", "doc", "web", "synth"]);

function transformBody(raw: string): string {
  try {
    const body = JSON.parse(raw) as {
      parts?: Array<{ type?: string; text?: string }>;
      variant?: string;
      agent?: string;
      mode?: string;
      [k: string]: unknown;
    };

    // variant に応じて prefix を付加
    if (
      Array.isArray(body.parts) &&
      body.parts.length > 0 &&
      (body.variant === "coding" ||
        body.variant === "analyze" ||
        body.variant === "business")
    ) {
      const first = body.parts[0];
      if (first && first.type === "text" && typeof first.text === "string") {
        if (body.variant === "coding") {
          if (!first.text.startsWith(CODING_PREFIX)) {
            first.text = CODING_PREFIX + first.text;
          }
        } else if (body.variant === "analyze") {
          // analyze: mode が許可リストにあれば対応 prefix、無ければ survey をデフォルト
          const mode =
            typeof body.mode === "string" && ALLOWED_ANALYZE_MODES.has(body.mode)
              ? (body.mode as "survey" | "detail" | "port")
              : "survey";
          const prefix = ANALYZE_PREFIXES[mode];
          if (!first.text.startsWith(prefix)) {
            first.text = prefix + first.text;
          }
        } else {
          // business: mode (BizPhase) が許可リストにあれば対応 prefix、無ければ data
          const phase =
            typeof body.mode === "string" && ALLOWED_BIZ_PHASES.has(body.mode)
              ? (body.mode as "data" | "doc" | "web" | "synth")
              : "data";
          const prefix = BIZ_PREFIXES[phase];
          if (!first.text.startsWith(prefix)) {
            first.text = prefix + first.text;
          }
        }
      }
    }
    delete body.variant;
    // mode は opencode に転送しない (Analyze 専用の UI 概念)
    delete body.mode;

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
