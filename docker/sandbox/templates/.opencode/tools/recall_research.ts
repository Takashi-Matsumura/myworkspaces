// Phase E-B-1: 過去レポート / 取り込み済みドキュメントを RAG で再呼び出しするツール。
//
// セットアップ:
//   - ホスト Next.js が /api/biz/internal/recall を提供
//   - サイドカー作成時に Env で BIZ_TOOL_TOKEN と MYWORKSPACES_SUB が注入される
//     (lib/docker-session.ts)
//   - 隔離 OFF 運用: コンテナから host.docker.internal:3000 で直接到達
//
// 使い分け (business-rules.md と整合):
//   - **先に recall_research** で過去のレポート / 取り込み済みドキュメントを参照
//   - 不足分があれば **次に web_search** で新規情報を取得
//   - これにより既存の知見を再発見でき、Web 検索の課金も抑制できる

import { tool } from "@opencode-ai/plugin"

const DEFAULT_NEXTJS_URL = "http://host.docker.internal:3000"
const DEFAULT_TOP_K = 4
const SNIPPET_LIMIT = 600 // チャンク本文の表示文字数上限

type Hit = {
  doc_id?: string
  filename?: string
  chunk_index?: number
  text?: string
  score?: number
}

type RecallResponse = {
  hits: Hit[]
  error?: string
}

function nextjsUrl(): string {
  return (process.env.BIZ_NEXTJS_INTERNAL_URL ?? DEFAULT_NEXTJS_URL).replace(/\/$/, "")
}

// Phase F-B-1: cwd `/root/workspaces/{id}/...` から workspace_id を抽出する。
// opencode の `session.directory` が cwd に効いている前提 (lib/docker-session 由来)。
// 取れなければ undefined → sidecar は legacy collection を見る。
function detectWorkspaceId(): string | undefined {
  try {
    const cwd = process.cwd()
    const m = cwd.match(/^\/root\/workspaces\/([A-Za-z0-9_-]+)(?:\/|$)/)
    if (!m) return undefined
    const id = m[1]
    if (id.length === 0 || id.length > 64) return undefined
    return id
  } catch {
    return undefined
  }
}

async function callInternal(
  body: Record<string, unknown>,
): Promise<RecallResponse | { error: string }> {
  const token = process.env.BIZ_TOOL_TOKEN
  if (!token) {
    return {
      error:
        "BIZ_TOOL_TOKEN が未設定です。ホスト .env で BIZ_TOOL_TOKEN を設定してから dev サーバを再起動してください。",
    }
  }
  const sub = process.env.MYWORKSPACES_SUB
  if (!sub) {
    return {
      error:
        "MYWORKSPACES_SUB が未設定です。コンテナ作成時に注入されるはずなので、サイドカー再作成を試してください。",
    }
  }
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-biz-tool-token": token,
    "x-myworkspaces-sub": sub,
  }
  const workspaceId = detectWorkspaceId()
  if (workspaceId) headers["x-myworkspaces-workspace-id"] = workspaceId
  try {
    const resp = await fetch(`${nextjsUrl()}/api/biz/internal/recall`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
    const text = await resp.text()
    if (!resp.ok) {
      let detail = text.slice(0, 500)
      try {
        const j = JSON.parse(text) as { error?: string }
        if (j.error) detail = j.error
      } catch {
        /* noop */
      }
      return { error: `recall HTTP ${resp.status}: ${detail}` }
    }
    return JSON.parse(text) as RecallResponse
  } catch (e) {
    return { error: `recall fetch 失敗: ${(e as Error).message}` }
  }
}

function formatRecall(query: string, resp: RecallResponse): string {
  const lines: string[] = []
  lines.push(`# Recall results for "${query}"`)
  lines.push("")
  if (resp.hits.length === 0) {
    lines.push("(過去レポート / 取り込み済みドキュメントに該当なし)")
    return lines.join("\n")
  }
  for (const [i, h] of resp.hits.entries()) {
    const fname = h.filename || "(unknown)"
    const idx = typeof h.chunk_index === "number" ? `#${h.chunk_index}` : ""
    const score = typeof h.score === "number" ? ` _score=${h.score.toFixed(3)}_` : ""
    lines.push(`## [${i + 1}] ${fname} ${idx}${score}`)
    const t = (h.text ?? "").trim()
    if (t.length > 0) {
      lines.push(t.length > SNIPPET_LIMIT ? t.slice(0, SNIPPET_LIMIT) + "…" : t)
    }
    lines.push("")
  }
  return lines.join("\n")
}

export default tool({
  description:
    "RAG 検索ツール。過去にアップロードしたドキュメントや既に書いた reports/ research/ の Markdown を" +
    "ベクトル検索で呼び出す。Web 検索より先にこちらを呼んで既存知見を確認するのが推奨。" +
    "結果は最大 16 件 (デフォルト 4 件) のチャンクで返る。",
  args: {
    query: tool.schema
      .string()
      .describe("検索クエリ。日本語可。具体的な固有名詞・年・主体を含めるとヒット率が上がる。"),
    top_k: tool.schema
      .number()
      .optional()
      .describe(`返却するチャンク数。デフォルト ${DEFAULT_TOP_K}、最大 16。`),
  },
  async execute(args) {
    const query = (args.query ?? "").trim()
    if (!query) {
      return "エラー: query を指定してください"
    }
    const resp = await callInternal({
      query,
      top_k: args.top_k,
    })
    if ("error" in resp && resp.error) return `エラー: ${resp.error}`
    return formatRecall(query, resp as RecallResponse)
  },
})
