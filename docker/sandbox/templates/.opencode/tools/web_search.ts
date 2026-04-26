// Web 検索 / 本文取得ツール (Phase B)。
//
// セットアップ:
//   - ホスト Next.js が /api/biz/internal/web-search を提供
//   - サイドカー作成時に Env で BIZ_TOOL_TOKEN が注入される (lib/docker-session.ts)
//   - 隔離 OFF 運用: コンテナから host.docker.internal:3000 で直接到達
//
// 検索 API キーはホスト .env のみ (TAVILY_API_KEY 等)。コンテナへは漏らさない。
//
// rules: business-rules.md の "DeepSearch 規律" を必ず守ること
//   - 1 ターン最大 5 クエリ
//   - 本文取得 (read_url) は最大 2 件
//   - 引用 3 件以上必須

import { tool } from "@opencode-ai/plugin"

const DEFAULT_NEXTJS_URL = "http://host.docker.internal:3000"
const DEFAULT_MAX_RESULTS = 5
const READ_CONTENT_LIMIT = 8000 // 本文返却の文字数上限

type SearchHit = {
  title: string
  url: string
  snippet: string
  published?: string
}

type SearchResponse = {
  provider: string
  hits: SearchHit[]
  error?: string
}

type ReadResponse = {
  provider: string
  title: string
  url: string
  content: string
  error?: string
}

function nextjsUrl(): string {
  return (process.env.BIZ_NEXTJS_INTERNAL_URL ?? DEFAULT_NEXTJS_URL).replace(/\/$/, "")
}

async function callInternal<T>(
  body: Record<string, unknown>,
): Promise<T | { error: string }> {
  const token = process.env.BIZ_TOOL_TOKEN
  if (!token) {
    return {
      error:
        "BIZ_TOOL_TOKEN が未設定です。ホスト .env で BIZ_TOOL_TOKEN を設定してから dev サーバを再起動してください。",
    }
  }
  try {
    const resp = await fetch(`${nextjsUrl()}/api/biz/internal/web-search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-biz-tool-token": token,
      },
      body: JSON.stringify(body),
    })
    const text = await resp.text()
    if (!resp.ok) {
      // サーバ側が { error: "..." } を返してきた場合に乗せる
      let detail = text.slice(0, 500)
      try {
        const j = JSON.parse(text) as { error?: string }
        if (j.error) detail = j.error
      } catch {
        /* noop */
      }
      return { error: `web-search HTTP ${resp.status}: ${detail}` }
    }
    return JSON.parse(text) as T
  } catch (e) {
    return { error: `web-search fetch 失敗: ${(e as Error).message}` }
  }
}

function formatSearch(query: string, resp: SearchResponse): string {
  const lines: string[] = []
  lines.push(`# Search results for "${query}" (provider: ${resp.provider})`)
  lines.push("")
  if (resp.hits.length === 0) {
    lines.push("(0 件)")
    return lines.join("\n")
  }
  for (const h of resp.hits) {
    const t = h.title || h.url
    const date = h.published ? ` _(${h.published.slice(0, 10)})_` : ""
    lines.push(`- [${t}](${h.url})${date}`)
    if (h.snippet) {
      // snippet は 280 文字程度に切る (検索結果一覧で読みやすい長さ)
      const s = h.snippet.replace(/\s+/g, " ").trim()
      lines.push(`  ${s.length > 280 ? s.slice(0, 280) + "…" : s}`)
    }
  }
  return lines.join("\n")
}

function formatRead(resp: ReadResponse): string {
  const title = resp.title || resp.url
  const content = (resp.content ?? "").slice(0, READ_CONTENT_LIMIT)
  const truncated = (resp.content?.length ?? 0) > READ_CONTENT_LIMIT
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push("")
  lines.push(`URL: ${resp.url}`)
  lines.push(`Provider: ${resp.provider}`)
  lines.push("")
  lines.push(content)
  if (truncated) {
    lines.push("")
    lines.push(`…(本文は ${READ_CONTENT_LIMIT} 文字で打ち切り)`)
  }
  return lines.join("\n")
}

export default tool({
  description:
    "インターネット検索 (DeepSearch) を行うツール。query で検索、" +
    "read_url を指定すると本文を Markdown で取得する。" +
    "1 ターンに 5 回まで、本文取得は 2 件までに留め、引用は最低 3 件用意すること。" +
    "結果は research/<slug>.md に追記し [^N] 脚注で URL を末尾に集約する。",
  args: {
    query: tool.schema
      .string()
      .optional()
      .describe(
        "検索クエリ。日本語可。read_url を指定する場合は省略可。",
      ),
    max_results: tool.schema
      .number()
      .optional()
      .describe(`検索結果の最大件数。デフォルト ${DEFAULT_MAX_RESULTS}、最大 20。`),
    read_url: tool.schema
      .string()
      .optional()
      .describe(
        "指定すると検索ではなく URL の本文を Markdown で取得する。検索結果上位ページを掘りたい時に使う。",
      ),
  },
  async execute(args) {
    if (args.read_url) {
      const resp = await callInternal<ReadResponse>({ read_url: args.read_url })
      if ("error" in resp && resp.error) return `エラー: ${resp.error}`
      return formatRead(resp as ReadResponse)
    }
    const query = (args.query ?? "").trim()
    if (!query) {
      return "エラー: query または read_url のどちらかを指定してください"
    }
    const max = Math.max(1, Math.min(20, args.max_results ?? DEFAULT_MAX_RESULTS))
    const resp = await callInternal<SearchResponse>({
      query,
      max_results: max,
    })
    if ("error" in resp && resp.error) return `エラー: ${resp.error}`
    return formatSearch(query, resp as SearchResponse)
  },
})
