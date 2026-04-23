// ワークスペースの PDF をテキスト抽出して返すカスタムツール。
//
// セットアップ:
//   - イメージに pdfjs-dist を global install 済み (Dockerfile 参照)
//   - ワークスペースの .opencode/tools/ に配置
//   - opencode.json の instructions に pdf-rules.md を追加
//
// AI エージェントが `.pdf` を読むときに自動で使われる想定。

import { tool } from "@opencode-ai/plugin"
import { readFile, stat } from "node:fs/promises"
import { extname, isAbsolute, join } from "node:path"

const SUPPORTED = new Set([".pdf"])
const MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_MAX_CHARS = 50000

// "1-3", "1,3,5", "1-3,7" 形式を 1 始まりのページ番号配列に展開する。
// 範囲外や不正セグメントは無視し、total 内にクランプ。
function parsePageRange(spec: string | undefined, total: number): number[] {
  if (!spec) return Array.from({ length: total }, (_, i) => i + 1)
  const result = new Set<number>()
  for (const seg of spec.split(",")) {
    const m = seg.trim().match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const start = Math.max(1, Math.min(total, Number(m[1])))
    const end = m[2] ? Math.max(1, Math.min(total, Number(m[2]))) : start
    const [lo, hi] = start <= end ? [start, end] : [end, start]
    for (let p = lo; p <= hi; p++) result.add(p)
  }
  return Array.from(result).sort((a, b) => a - b)
}

// PDF item の transform[5] は y 座標 (bottom origin)。同じ y を 1 行と扱う。
function itemsToLines(items: Array<{ str: string; transform: number[] }>): string {
  const lines: string[] = []
  let current = ""
  let lastY: number | null = null
  for (const it of items) {
    const y = it.transform?.[5]
    if (typeof y === "number" && lastY !== null && Math.abs(y - lastY) > 1) {
      lines.push(current)
      current = ""
    }
    current += it.str
    if (typeof y === "number") lastY = y
  }
  if (current) lines.push(current)
  return lines.join("\n").replace(/[ \t]+\n/g, "\n").trim()
}

export default tool({
  description:
    "ワークスペース内の PDF ファイル (.pdf) を読み、本文テキストを " +
    "ページ区切りで返す。Read ツールで PDF を開くとバイナリで中身が読めないので、" +
    "PDF は必ずこのツールを使うこと。",
  args: {
    file_path: tool.schema
      .string()
      .describe("読み取る PDF のパス。ワークスペース内の相対パスまたは絶対パス。"),
    pages: tool.schema
      .string()
      .optional()
      .describe(
        '抽出するページ範囲。例: "1-3" / "1,3,5" / "2-5,8"。省略時は全ページ。',
      ),
    max_chars: tool.schema
      .number()
      .optional()
      .describe(`返す最大文字数 (ページ合算)。デフォルト ${DEFAULT_MAX_CHARS}、最大 500000。`),
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
      return `ファイルが大きすぎます (${size} > ${MAX_BYTES})。pages 引数で部分読込してください。`
    }

    let buf: Buffer
    try {
      buf = await readFile(resolved)
    } catch (e) {
      return `読み込みに失敗しました: ${(e as Error).message}`
    }

    // pdfjs-dist の Node 向け legacy build を使う。worker 不要。
    let pdfjsLib: typeof import("pdfjs-dist")
    try {
      pdfjsLib = (await import(
        "pdfjs-dist/legacy/build/pdf.mjs"
      )) as typeof import("pdfjs-dist")
    } catch (e) {
      return `pdfjs-dist のロードに失敗しました (${(e as Error).message})。グローバルに pdfjs-dist を install してください。`
    }

    let doc
    try {
      doc = await pdfjsLib.getDocument({
        data: new Uint8Array(buf),
        useSystemFonts: true,
        disableFontFace: true,
        isEvalSupported: false,
      }).promise
    } catch (e) {
      return `PDF の解析に失敗しました: ${(e as Error).message}`
    }

    const total = doc.numPages
    const targets = parsePageRange(args.pages, total)
    const maxChars = Math.max(1000, Math.min(args.max_chars ?? DEFAULT_MAX_CHARS, 500000))

    const out: string[] = []
    out.push(`ファイル: ${resolved}`)
    out.push(`総ページ数: ${total} / 抽出ページ: ${targets.length} (${targets.join(", ")})`)
    out.push("")

    let remaining = maxChars
    for (const p of targets) {
      if (remaining <= 0) {
        out.push(`(最大文字数 ${maxChars} に到達したためページ ${p} 以降は省略)`)
        break
      }
      let text: string
      try {
        const page = await doc.getPage(p)
        const content = await page.getTextContent()
        text = itemsToLines(
          content.items as unknown as Array<{ str: string; transform: number[] }>,
        )
      } catch (e) {
        out.push(`--- ページ ${p} --- (抽出失敗: ${(e as Error).message})`)
        continue
      }
      const snippet =
        text.length > remaining ? text.slice(0, remaining) + "\n…(truncated)" : text
      remaining -= snippet.length
      out.push(`--- ページ ${p} ---`)
      out.push(snippet || "(空ページ)")
      out.push("")
    }

    return out.join("\n")
  },
})
