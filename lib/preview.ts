import * as XLSX from "xlsx";
import { execCollect, readFile, readFileBytes, WorkspaceError } from "./workspace";

// 右ペインのプレビューに返す形式。クライアント側はここを見て描画方式を切り替える。
// - markdown: react-markdown でレンダリング (md / csv / xlsx / pdf を統一フォーマットに)
// - text:     <pre> で生表示 (コード / json / yaml 等)
// - image:    <img src=rawUrl /> で表示 (rawUrl は /api/workspace/file/raw)
// - unsupported: 拡張子が判らないバイナリは「プレビュー非対応」表示にフォールバック
export type PreviewKind = "markdown" | "text" | "image" | "unsupported";

export type PreviewResult = {
  kind: PreviewKind;
  path: string;
  size: number;
  truncated: boolean;
  // markdown / text の本文。kind=image / unsupported では未設定。
  content?: string;
  // text の場合のシンタックスハイライト言語ヒント (拡張子から推定)。
  language?: string;
  // image の場合にクライアントが埋め込む URL。
  rawUrl?: string;
  // 元ファイルが二段変換 (xlsx -> markdown 等) かどうか。表示の注記に使う。
  converted?: "xlsx" | "csv" | "pdf";
};

const TEXT_EXTENSIONS = new Set([
  "txt",
  "log",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "kt",
  "swift",
  "sh",
  "bash",
  "zsh",
  "sql",
  "html",
  "htm",
  "xml",
  "svg",
  "css",
  "scss",
  "lock",
]);

const IMAGE_EXTENSIONS = new Map<string, string>([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["bmp", "image/bmp"],
  ["svg", "image/svg+xml"],
  ["ico", "image/x-icon"],
]);

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const CSV_EXTENSIONS = new Set(["csv", "tsv"]);
const XLSX_EXTENSIONS = new Set(["xlsx", "xls", "xlsm"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

function extname(path: string): string {
  const i = path.lastIndexOf(".");
  if (i < 0) return "";
  return path.slice(i + 1).toLowerCase();
}

export function imageContentType(path: string): string | null {
  return IMAGE_EXTENSIONS.get(extname(path)) ?? null;
}

// テキスト中の `|` をエスケープしつつ、改行を空白に潰す (markdown table セル用)。
function escapeCell(s: unknown): string {
  return String(s ?? "")
    .replace(/\r\n|\r|\n/g, " ")
    .replace(/\|/g, "\\|");
}

function rowsToMarkdownTable(rows: unknown[][]): string {
  if (rows.length === 0) return "_(empty)_\n";
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const header = rows[0];
  const body = rows.slice(1);
  const headerCells = Array.from({ length: width }, (_, i) =>
    escapeCell(header[i] ?? `col${i + 1}`),
  );
  const sep = Array.from({ length: width }, () => "---");
  const lines: string[] = [];
  lines.push(`| ${headerCells.join(" | ")} |`);
  lines.push(`| ${sep.join(" | ")} |`);
  for (const r of body) {
    const cells = Array.from({ length: width }, (_, i) => escapeCell(r[i]));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}

// CSV / TSV の簡易パーサ。RFC 4180 に厳密ではないがプレビュー用には十分。
// 二重引用符 ("") のエスケープと改行入りセルだけ拾う。
function parseDelimited(text: string, delimiter: string): unknown[][] {
  const rows: unknown[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvToMarkdown(text: string, delimiter: string): string {
  const rows = parseDelimited(text, delimiter);
  return rowsToMarkdownTable(rows);
}

// XLSX / XLS / XLSM を全シート分 markdown のテーブルに展開。
async function xlsxToMarkdown(sub: string, path: string): Promise<{ md: string; truncated: boolean; size: number }>
{
  const { buffer, size, truncated } = await readFileBytes(sub, path);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sections: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false,
      defval: "",
    }) as unknown[][];
    sections.push(`## ${sheetName}\n`);
    sections.push(rowsToMarkdownTable(rows));
    sections.push("");
  }
  return { md: sections.join("\n").trim() + "\n", size, truncated };
}

// PDF は read_pdf.ts と同じ pypdf 抽出をそのままインライン実行する。
// child_process ではなく docker exec 経由なので、コンテナ内 python3 + pypdf に依存。
// 出力は { ok, pages: [{ index, text }] } の JSON 1 行。
const PDF_PYTHON = `
import sys, json
try:
    from pypdf import PdfReader
    r = PdfReader(sys.argv[1])
    out = []
    for i, page in enumerate(r.pages):
        try:
            txt = page.extract_text() or ""
        except Exception as e:
            txt = f"(pypdf extract_text error: {e})"
        out.append({"index": i + 1, "text": txt})
    print(json.dumps({"ok": True, "pages": out}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`;

async function pdfToMarkdown(sub: string, path: string): Promise<{ md: string; size: number; pages: number }>
{
  const res = await execCollect(sub, ["python3", "-c", PDF_PYTHON, path]);
  if (res.exitCode !== 0) {
    throw new WorkspaceError(
      `pdf preview failed: ${res.stderr.toString("utf-8") || "exit " + res.exitCode}`,
      500,
    );
  }
  const stdout = res.stdout.toString("utf-8").trim();
  let parsed: { ok: boolean; pages?: { index: number; text: string }[]; error?: string };
  try {
    parsed = JSON.parse(stdout) as typeof parsed;
  } catch {
    throw new WorkspaceError(`pdf preview: failed to parse pypdf output`, 500);
  }
  if (!parsed.ok || !parsed.pages) {
    throw new WorkspaceError(`pdf preview: ${parsed.error ?? "unknown error"}`, 500);
  }
  const sections = parsed.pages.map((p) => {
    const body = p.text.trim();
    return `## Page ${p.index}\n\n${body || "_(no extractable text)_"}\n`;
  });
  // size は readFileBytes と整合させたいが PDF 全体を読まないので stat のみ。
  // ここでは「変換後 markdown の文字数」を size として返す (UI 側は参考表示)。
  return {
    md: sections.join("\n"),
    size: stdout.length,
    pages: parsed.pages.length,
  };
}

export function previewKind(path: string): PreviewKind {
  const ext = extname(path);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
  if (CSV_EXTENSIONS.has(ext)) return "markdown";
  if (XLSX_EXTENSIONS.has(ext)) return "markdown";
  if (PDF_EXTENSIONS.has(ext)) return "markdown";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  // 拡張子なし or 未知拡張子はテキストとして読みに行き、UTF-8 として読めなければ unsupported。
  return "text";
}

export async function previewFile(
  sub: string,
  path: string,
): Promise<PreviewResult> {
  const ext = extname(path);
  const kind = previewKind(path);

  if (kind === "image") {
    return {
      kind: "image",
      path,
      size: 0,
      truncated: false,
      rawUrl: `/api/workspace/file/raw?path=${encodeURIComponent(path)}`,
    };
  }

  if (XLSX_EXTENSIONS.has(ext)) {
    const { md, size, truncated } = await xlsxToMarkdown(sub, path);
    return {
      kind: "markdown",
      path,
      size,
      truncated,
      content: md,
      converted: "xlsx",
    };
  }

  if (PDF_EXTENSIONS.has(ext)) {
    const { md, size } = await pdfToMarkdown(sub, path);
    return {
      kind: "markdown",
      path,
      size,
      truncated: false,
      content: md,
      converted: "pdf",
    };
  }

  if (CSV_EXTENSIONS.has(ext)) {
    const payload = await readFile(sub, path);
    const delimiter = ext === "tsv" ? "\t" : ",";
    return {
      kind: "markdown",
      path,
      size: payload.size,
      truncated: payload.truncated,
      content: csvToMarkdown(payload.content, delimiter),
      converted: "csv",
    };
  }

  if (MARKDOWN_EXTENSIONS.has(ext)) {
    const payload = await readFile(sub, path);
    return {
      kind: "markdown",
      path,
      size: payload.size,
      truncated: payload.truncated,
      content: payload.content,
    };
  }

  // text 系 / 不明拡張子
  const payload = await readFile(sub, path);
  return {
    kind: "text",
    path,
    size: payload.size,
    truncated: payload.truncated,
    content: payload.content,
    language: ext || undefined,
  };
}
