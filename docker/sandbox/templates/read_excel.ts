// ワークスペースの Excel/CSV を Markdown 表で返すカスタムツール。
//
// セットアップ:
//   cd <workspace>
//   npm init -y && npm install xlsx
//
// このファイルをワークスペースの .opencode/tools/ に配置し、
// opencode.json の instructions に business-rules.md を追加しておくと、
// AI エージェントが `.xlsx/.xls/.xlsm/.csv` を読むときに自動で使います。

import { tool } from "@opencode-ai/plugin"
import { readFile, stat } from "node:fs/promises"
import { extname, isAbsolute, join } from "node:path"
import * as XLSX from "xlsx"

const SUPPORTED = new Set([".xlsx", ".xls", ".xlsm", ".csv"])
const MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_MAX_ROWS = 200

function toMarkdownTable(headers: string[], rows: string[][]): string {
  const escape = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ")
  const headerLine = `| ${headers.map((h) => escape(h || "(col)")).join(" | ")} |`
  const sepLine = `| ${headers.map(() => "---").join(" | ")} |`
  const bodyLines = rows.map(
    (r) => `| ${r.map((c) => escape(c ?? "")).join(" | ")} |`,
  )
  return [headerLine, sepLine, ...bodyLines].join("\n")
}

export default tool({
  description:
    "ワークスペース内の Excel/CSV ファイル (.xlsx/.xls/.xlsm/.csv) を読み、" +
    "指定シート (省略時は先頭) の内容を Markdown テーブルで返す。" +
    "Read ツールで Excel を開くとバイナリになり意味不明になるので、" +
    "Excel/CSV はこのツールを必ず使うこと。",
  args: {
    file_path: tool.schema
      .string()
      .describe("読み取るファイルのパス。ワークスペース内の相対パスまたは絶対パス。"),
    sheet: tool.schema
      .string()
      .optional()
      .describe("読み取るシート名。省略時は先頭シート。"),
    max_rows: tool.schema
      .number()
      .optional()
      .describe(`返す最大行数 (ヘッダーを除く)。デフォルト ${DEFAULT_MAX_ROWS}。`),
  },
  async execute(args, context) {
    const resolved = isAbsolute(args.file_path)
      ? args.file_path
      : join(context.directory, args.file_path)

    const ext = extname(resolved).toLowerCase()
    if (!SUPPORTED.has(ext)) {
      return `対応していない拡張子: "${ext}" (対応: ${[...SUPPORTED].join(", ")})`
    }

    let size: number
    try {
      const s = await stat(resolved)
      if (!s.isFile()) return `ファイルではありません: ${resolved}`
      size = s.size
    } catch (e) {
      return `ファイルが見つかりません: ${resolved} — ${(e as Error).message}`
    }
    if (size > MAX_BYTES) {
      return `ファイルが大きすぎます (${size} > ${MAX_BYTES})。部分的に確認する場合は別ツールを使ってください。`
    }

    let buf: Buffer
    try {
      buf = await readFile(resolved)
    } catch (e) {
      return `読み込みに失敗しました: ${(e as Error).message}`
    }

    let wb: XLSX.WorkBook
    try {
      wb = XLSX.read(buf, { type: "buffer", cellDates: true })
    } catch (e) {
      return `ファイルのパースに失敗しました: ${(e as Error).message}`
    }

    const sheetNames = wb.SheetNames ?? []
    if (sheetNames.length === 0) return "ワークブックにシートが含まれていません。"

    const target =
      args.sheet && sheetNames.includes(args.sheet) ? args.sheet : sheetNames[0]
    const ws = wb.Sheets[target]
    if (!ws) return `シート "${target}" が見つかりません。利用可能: ${sheetNames.join(", ")}`

    const raw = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(
      ws,
      { header: 1, blankrows: false, defval: "", raw: false },
    )
    const asStrings = raw.map((r) => r.map((v) => (v == null ? "" : String(v))))
    const headers = asStrings[0] ?? []
    const allRows = asStrings.slice(1)
    const maxRows = Math.max(1, Math.min(args.max_rows ?? DEFAULT_MAX_ROWS, 1000))
    const rows = allRows.slice(0, maxRows)

    const cols = Math.max(headers.length, ...rows.map((r) => r.length))
    const normHeaders = Array.from({ length: cols }, (_, i) => headers[i] ?? "")
    const normRows = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""))

    const summary = [
      `ファイル: ${resolved}`,
      `シート: "${target}" (全 ${sheetNames.length} シート: ${sheetNames.map((n) => `"${n}"`).join(", ")})`,
      `サイズ: ${cols} 列 × ${allRows.length} 行` +
        (rows.length < allRows.length ? ` (先頭 ${rows.length} 行のみ表示)` : ""),
    ].join("\n")

    return `${summary}\n\n${toMarkdownTable(normHeaders, normRows)}`
  },
})
