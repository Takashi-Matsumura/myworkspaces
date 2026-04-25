"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { PreviewResult } from "@/lib/preview";

// 右ペインのファイルプレビュー。kind に応じてレンダリングを切り替える。
// - markdown: react-markdown + remark-gfm でテーブル含めて整形表示
//   (xlsx / csv / pdf は API 側で markdown 化されてからここに来る)
// - image:    <img> で直接埋め込み (raw bytes は /api/workspace/file/raw 経由)
// - text:     <pre> で生表示
// - unsupported: バイナリ等のフォールバック
export default function FilePreview({
  result,
  fontSize,
}: {
  result: PreviewResult;
  fontSize: number;
}) {
  const filename = result.path.split("/").pop() ?? result.path;
  const meta: string[] = [];
  if (result.converted === "xlsx") meta.push("xlsx → markdown");
  if (result.converted === "csv") meta.push("csv → markdown");
  if (result.converted === "pdf") meta.push("pdf → markdown (pypdf)");
  if (result.truncated) meta.push("truncated");

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[10px] text-slate-500">
        {filename}
        {meta.length > 0 && (
          <span className="ml-2 text-amber-600">({meta.join(" · ")})</span>
        )}
      </div>

      {result.kind === "image" && result.rawUrl && (
        <div className="flex items-start justify-center px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.rawUrl}
            alt={filename}
            className="max-h-[800px] max-w-full object-contain"
          />
        </div>
      )}

      {result.kind === "markdown" && (
        <div
          className="prose prose-sm max-w-none px-3 py-2 prose-table:text-[0.85em] prose-th:bg-slate-100 prose-pre:bg-slate-100 prose-pre:text-slate-800"
          style={{ fontSize }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {result.content ?? ""}
          </ReactMarkdown>
        </div>
      )}

      {result.kind === "text" && (
        <pre
          className="px-3 py-2 font-mono whitespace-pre-wrap break-words text-slate-800"
          style={{ fontSize }}
        >
          {result.content ?? ""}
        </pre>
      )}

      {result.kind === "unsupported" && (
        <div className="px-3 py-2 font-mono text-slate-400" style={{ fontSize }}>
          このファイル形式はプレビュー非対応です
        </div>
      )}
    </>
  );
}
