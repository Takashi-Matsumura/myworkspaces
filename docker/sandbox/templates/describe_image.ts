import { tool } from "@opencode-ai/plugin"
import { readFile } from "node:fs/promises"
import { extname, isAbsolute, join } from "node:path"

const LLAMA_URL =
  process.env.LLAMA_VISION_URL ?? "http://host.docker.internal:8080/v1/chat/completions"
const MODEL = process.env.LLAMA_VISION_MODEL ?? "gemma-4-e4b-it-Q4_K_M.gguf"

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

export default tool({
  description:
    "ワークスペース内の画像ファイルを視覚モデル (Gemma 4 E4B) で解析し、その内容の記述を返す。" +
    "ユーザーが画像ファイル (.png/.jpg/.jpeg/.webp/.gif) について質問したときに必ず使用する。" +
    "Read ツールで画像を読み込む代わりに、このツールを使って実際の画像内容を得ること。",
  args: {
    file_path: tool.schema
      .string()
      .describe("解析する画像のパス。ワークスペース内の相対パスまたは絶対パス。"),
    question: tool.schema
      .string()
      .optional()
      .describe("画像について聞きたいこと。省略時は一般的な日本語の説明を生成する。"),
  },
  async execute(args, context) {
    const resolved = isAbsolute(args.file_path)
      ? args.file_path
      : join(context.directory, args.file_path)

    const ext = extname(resolved).toLowerCase()
    const mime = MIME[ext]
    if (!mime) {
      return `対応していない画像形式です: "${ext}" (対応: ${Object.keys(MIME).join(", ")})`
    }

    let buf: Buffer
    try {
      buf = await readFile(resolved)
    } catch (e) {
      return `画像ファイルの読み込みに失敗しました: ${resolved} — ${(e as Error).message}`
    }

    const b64 = buf.toString("base64")
    const question =
      args.question ?? "この画像に写っているものを日本語で詳しく説明してください。"

    let res: Response
    try {
      res = await fetch(LLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
                { type: "text", text: question },
              ],
            },
          ],
          max_tokens: 2048,
          temperature: 0.2,
        }),
      })
    } catch (e) {
      return `ビジョン API への接続に失敗しました (${LLAMA_URL}): ${(e as Error).message}`
    }

    if (!res.ok) {
      return `ビジョン API エラー ${res.status} ${res.statusText}: ${await res.text()}`
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data.choices?.[0]?.message?.content?.trim() ?? ""
    if (!content) {
      return "（ビジョンモデルから空の応答が返りました。max_tokens 不足または思考段階で打ち切られた可能性があります。）"
    }
    return content
  },
})
