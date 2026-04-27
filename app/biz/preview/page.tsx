"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { BizMarkdown } from "@/app/demo/components/biz-markdown";

// Phase E-C-1: Biz パネルで生成した reports/<topic>.md や research/<slug>.md を
// 整形済み HTML で表示する印刷プレビュー画面。ブラウザの Cmd+P (PDF 保存) で
// PDF 化することを前提に、@media print で改ページや余白を整える。
//
// クエリ: /biz/preview?workspaceId=<id>&path=<absolute path>
//   path はワークスペース外を弾くため API 側 (lib/workspace.ts isInsideWorkspaces) で検証。
//   workspaceId は表示ヘッダ用。

type Status =
  | { kind: "loading" }
  | { kind: "ready"; content: string; path: string; truncated: boolean }
  | { kind: "error"; message: string };

export default function BizPreviewPage() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [path, setPath] = useState<string>("");

  const load = useCallback(async (target: string) => {
    setStatus({ kind: "loading" });
    try {
      const url = `/api/workspace/file?path=${encodeURIComponent(target)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        content?: string;
        path?: string;
        truncated?: boolean;
      };
      setStatus({
        kind: "ready",
        content: json.content ?? "",
        path: json.path ?? target,
        truncated: Boolean(json.truncated),
      });
    } catch (err) {
      setStatus({ kind: "error", message: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get("path") ?? "";
    if (!target) {
      setStatus({ kind: "error", message: "path クエリが必要です (例: ?path=/root/workspaces/.../reports/foo.md)" });
      return;
    }
    setPath(target);
    void load(target);
  }, [load]);

  return (
    <div className="biz-preview min-h-screen bg-slate-100 text-slate-900">
      {/* 印刷時に隠すツールバー */}
      <header className="biz-preview-toolbar sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <span className="font-mono text-xs text-slate-500">印刷プレビュー</span>
        {path && (
          <span className="truncate font-mono text-xs text-slate-700" title={path}>
            {path.split("/").slice(-3).join("/")}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => path && void load(path)}
            disabled={status.kind === "loading"}
            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${status.kind === "loading" ? "animate-spin" : ""}`}
            />
            再読込
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={status.kind !== "ready"}
            className="inline-flex items-center gap-1 rounded border border-emerald-500 bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:border-slate-300 disabled:bg-slate-300"
          >
            <Printer className="h-3.5 w-3.5" />
            印刷 / PDF 保存
          </button>
        </span>
      </header>

      <main className="biz-preview-main mx-auto my-8 max-w-[820px] rounded-md bg-white px-10 py-12 shadow">
        {status.kind === "loading" && (
          <div className="font-mono text-sm text-slate-400">loading…</div>
        )}
        {status.kind === "error" && (
          <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 font-mono text-sm text-rose-700">
            読み込みに失敗しました: {status.message}
          </div>
        )}
        {status.kind === "ready" && (
          <>
            {status.truncated && (
              <div className="biz-preview-toolbar mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ ファイルが大きいため先頭部分のみ表示しています。完全な内容を見るには
                ワークスペース側で直接開いてください。
              </div>
            )}
            <BizMarkdown source={status.content} fontSize={14} />
          </>
        )}
      </main>

      {/* 印刷向け CSS。toolbar / 余白 / 改ページを制御。 */}
      <style jsx global>{`
        @media print {
          .biz-preview {
            background: white !important;
          }
          .biz-preview-toolbar {
            display: none !important;
          }
          .biz-preview-main {
            margin: 0 !important;
            box-shadow: none !important;
            max-width: none !important;
            padding: 0 !important;
          }
          .biz-preview .prose h1,
          .biz-preview .prose h2 {
            break-after: avoid;
          }
          .biz-preview .prose pre,
          .biz-preview .prose table,
          .biz-preview .prose blockquote {
            break-inside: avoid;
          }
          @page {
            margin: 18mm 16mm;
          }
        }
      `}</style>
    </div>
  );
}
