// ワークスペースの PDF をテキスト抽出して返すカスタムツール。
//
// セットアップ:
//   - イメージに python3 + pip + pypdf を install 済み (Dockerfile 参照)
//   - ワークスペースの .opencode/tools/ に配置
//   - opencode.json の instructions に pdf-rules.md を追加
//
// 実装メモ:
//   Node.js 側の PDF パーサ (pdfjs-dist v5 / pdf-parse v2) は reportlab の
//   CID フォント (HeiseiKakuGo 等) で作られた PDF の ToUnicode CMap を読み
//   損ねるため、ToUnicode を素直に扱える Python + pypdf を child_process で
//   呼び出す形にした。入出力は JSON。

import { tool } from "@opencode-ai/plugin"
import { stat } from "node:fs/promises"
import { extname, isAbsolute, join } from "node:path"
import { spawn } from "node:child_process"

const SUPPORTED = new Set([".pdf"])
const MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_MAX_CHARS = 50000
const PYTHON_BIN = "python3"
const EXEC_TIMEOUT_MS = 60000

// pypdf を呼んで JSON を返すだけの最小スクリプト。
// コンテナ内の Python 3.12 で pypdf が使える前提。
const PY_SCRIPT = `
import json, sys, traceback
try:
    from pypdf import PdfReader
except Exception as e:
    print(json.dumps({"error": f"pypdf import failed: {e}"}))
    sys.exit(2)

path = sys.argv[1]
try:
    r = PdfReader(path)
    pages = []
    for i, p in enumerate(r.pages):
        try:
            t = p.extract_text() or ""
        except Exception as e:
            t = f"(extract_text error on page {i+1}: {e})"
        pages.append({"num": i + 1, "text": t})
    print(json.dumps({"total": len(r.pages), "pages": pages}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    sys.exit(3)
`

// pages 指定 ("1-3" / "1,3,5") を 1 始まりのページ番号配列に展開する。
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

type PyResultOk = {
  total: number
  pages: { num: number; text: string }[]
}
type PyResultErr = { error: string; trace?: string }

function runPython(filePath: string): Promise<PyResultOk | PyResultErr> {
  return new Promise((resolve) => {
    const child = spawn(PYTHON_BIN, ["-c", PY_SCRIPT, filePath], {
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    child.stdout.on("data", (b: Buffer) => stdoutChunks.push(b))
    child.stderr.on("data", (b: Buffer) => stderrChunks.push(b))

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({
        error: `pypdf 実行がタイムアウトしました (${EXEC_TIMEOUT_MS} ms)`,
      })
    }, EXEC_TIMEOUT_MS)

    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ error: `python3 の起動に失敗しました: ${err.message}` })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8")
      const stderr = Buffer.concat(stderrChunks).toString("utf-8")
      if (code !== 0 && !stdout) {
        resolve({ error: `python3 が exit ${code}: ${stderr.trim()}` })
        return
      }
      try {
        resolve(JSON.parse(stdout) as PyResultOk | PyResultErr)
      } catch (e) {
        resolve({
          error: `出力 JSON のパースに失敗: ${(e as Error).message} (stdout 先頭: ${stdout.slice(0, 200)})`,
        })
      }
    })
  })
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

    try {
      const s = await stat(resolved)
      if (!s.isFile()) return `ファイルではありません: ${resolved}`
      if (s.size > MAX_BYTES) {
        return `ファイルが大きすぎます (${s.size} > ${MAX_BYTES})。pages 引数で部分読込してください。`
      }
    } catch (e) {
      return `ファイルが見つかりません: ${resolved} — ${(e as Error).message}`
    }

    const res = await runPython(resolved)
    if ("error" in res) {
      return `PDF の解析に失敗しました: ${res.error}`
    }

    const total = res.total
    const targets = parsePageRange(args.pages, total)
    const maxChars = Math.max(1000, Math.min(args.max_chars ?? DEFAULT_MAX_CHARS, 500000))

    const byNum = new Map<number, string>()
    for (const p of res.pages) byNum.set(p.num, p.text ?? "")

    const out: string[] = []
    out.push(`ファイル: ${resolved}`)
    out.push(`総ページ数: ${total} / 抽出ページ: ${targets.length} (${targets.join(", ")})`)
    out.push("")

    let remaining = maxChars
    let emptyPages = 0
    for (const p of targets) {
      if (remaining <= 0) {
        out.push(`(最大文字数 ${maxChars} に到達したためページ ${p} 以降は省略)`)
        break
      }
      const text = (byNum.get(p) ?? "").trim()
      if (!text) emptyPages++
      const snippet =
        text.length > remaining ? text.slice(0, remaining) + "\n…(truncated)" : text
      remaining -= snippet.length
      out.push(`--- ページ ${p} ---`)
      out.push(snippet || "(空ページ)")
      out.push("")
    }

    if (emptyPages === targets.length && targets.length > 0) {
      out.push(
        "(警告: 全ページの抽出テキストが空でした。画像ベースの PDF か、" +
          "極端に特殊な埋め込み方法の可能性があります。)",
      )
    }

    return out.join("\n")
  },
})
