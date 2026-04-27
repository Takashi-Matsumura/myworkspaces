"use client";

import { useCallback, useEffect, useState, use as reactUse } from "react";
import { Printer } from "lucide-react";
import { BizMarkdown } from "@/app/demo/components/biz-markdown";

// Phase E-C-3: 署名付き共有 URL の公開閲覧ページ。
// /share/<token> でアクセス可能。Cookie 不要 (proxy.ts の matcher 外)。
//
// クエリ取得は /api/share/<token> 経由。404 / 410 を表示分岐する。

type Status =
  | { kind: "loading" }
  | {
      kind: "ready";
      content: string;
      relativePath: string;
      truncated: boolean;
      expiresAt: string | null;
    }
  | { kind: "error"; status: number; message: string };

export default function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = reactUse(params);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  const load = useCallback(async () => {
    setStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus({
          kind: "error",
          status: res.status,
          message: errBody.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      const json = (await res.json()) as {
        content?: string;
        relativePath?: string;
        truncated?: boolean;
        expiresAt?: string | null;
      };
      setStatus({
        kind: "ready",
        content: json.content ?? "",
        relativePath: json.relativePath ?? "",
        truncated: Boolean(json.truncated),
        expiresAt: json.expiresAt ?? null,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        status: 0,
        message: (err as Error).message,
      });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="biz-share min-h-screen bg-slate-100 text-slate-900">
      {/* 印刷時に隠すツールバー */}
      <header className="biz-share-toolbar sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <span className="font-mono text-xs text-slate-500">共有レポート</span>
        {status.kind === "ready" && (
          <>
            <span
              className="truncate font-mono text-xs text-slate-700"
              title={status.relativePath}
            >
              {status.relativePath}
            </span>
            {status.expiresAt && (
              <span
                className="rounded bg-amber-100 px-2 py-0.5 font-mono text-[10px] text-amber-800"
                title="この URL は期限付きです"
              >
                〜
                {new Date(status.expiresAt).toLocaleDateString("ja-JP", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                })}
              </span>
            )}
          </>
        )}
        <span className="ml-auto flex items-center gap-1">
          {status.kind === "ready" && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1 rounded border border-emerald-500 bg-emerald-500 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
            >
              <Printer className="h-3.5 w-3.5" />
              印刷 / PDF 保存
            </button>
          )}
        </span>
      </header>

      <main className="biz-share-main mx-auto my-8 max-w-[820px] rounded-md bg-white px-10 py-12 shadow">
        {status.kind === "loading" && (
          <div className="font-mono text-sm text-slate-400">loading…</div>
        )}
        {status.kind === "error" && (
          <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 font-mono text-sm text-rose-700">
            {status.status === 404 && "この共有 URL は存在しません。"}
            {status.status === 410 && "この共有 URL は期限切れです。発行者に再発行を依頼してください。"}
            {status.status !== 404 && status.status !== 410 && (
              <>読み込みに失敗しました: {status.message}</>
            )}
          </div>
        )}
        {status.kind === "ready" && (
          <>
            {status.truncated && (
              <div className="biz-share-toolbar mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ ファイルが大きいため先頭部分のみ表示しています。
              </div>
            )}
            <BizMarkdown source={status.content} fontSize={14} />
          </>
        )}
      </main>

      {/* 印刷向け CSS。toolbar / 余白 / 改ページを制御。 */}
      <style jsx global>{`
        @media print {
          .biz-share {
            background: white !important;
          }
          .biz-share-toolbar {
            display: none !important;
          }
          .biz-share-main {
            margin: 0 !important;
            box-shadow: none !important;
            max-width: none !important;
            padding: 0 !important;
          }
          .biz-share .prose h1,
          .biz-share .prose h2 {
            break-after: avoid;
          }
          .biz-share .prose pre,
          .biz-share .prose table,
          .biz-share .prose blockquote {
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
