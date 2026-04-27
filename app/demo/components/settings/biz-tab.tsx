"use client";

import { RefreshCw } from "lucide-react";
import type { BizUsage } from "./use-settings-loader";

type Props = {
  bizUsage: BizUsage | null;
  bizUsageLoading: boolean;
  loadBizUsage: () => void;
};

// Phase D-B: Biz パネル DeepSearch の利用状況。
// Tavily 等のプロバイダ自体は残量取得 API を提供していないため、自前で
// プロセス内のカウンタを表示する (今月 / セッション / キャッシュヒット)。
// プロセス再起動でリセットされる仕様であることをツールチップで明示。
export function BizTab({ bizUsage, bizUsageLoading, loadBizUsage }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">
            DeepSearch 利用状況
          </span>
          <button
            type="button"
            onClick={loadBizUsage}
            disabled={bizUsageLoading}
            className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-50"
            title="再取得"
          >
            <RefreshCw
              className={`h-3 w-3 ${bizUsageLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {bizUsage ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className="rounded bg-emerald-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-700"
                title="現在使用中のプロバイダ。BIZ_SEARCH_PROVIDER で切替可能"
              >
                {bizUsage.provider}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {bizUsage.monthKey}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-700">
              <div
                className="flex flex-col items-center rounded border border-slate-200 bg-white px-2 py-1.5"
                title="今月に API へ実際に飛んだ web_search 呼び出し回数 (キャッシュヒットは含まない)"
              >
                <span className="text-slate-400" style={{ fontSize: "9px" }}>
                  今月の API 呼出
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {bizUsage.monthCount}
                </span>
              </div>
              <div
                className="flex flex-col items-center rounded border border-slate-200 bg-white px-2 py-1.5"
                title="プロセス起動以降の API 呼出回数。dev サーバ再起動でリセット"
              >
                <span className="text-slate-400" style={{ fontSize: "9px" }}>
                  本セッション
                </span>
                <span className="text-base font-semibold tabular-nums">
                  {bizUsage.sessionCount}
                </span>
              </div>
              <div
                className="flex flex-col items-center rounded border border-slate-200 bg-white px-2 py-1.5"
                title="同一クエリ / URL の重複呼出を 5 分キャッシュで吸収した回数"
              >
                <span className="text-slate-400" style={{ fontSize: "9px" }}>
                  キャッシュ命中
                </span>
                <span className="text-base font-semibold tabular-nums text-emerald-700">
                  {bizUsage.cacheHitCount}
                </span>
              </div>
            </div>

            <div className="text-[10px] leading-relaxed text-slate-500">
              キャッシュ TTL は 5 分 / プロバイダごとに分離。今月のカウンタは
              プロセス再起動でリセットされます (永続化なし)。Tavily / Brave /
              Serper は残量取得 API を提供していないため、ここに表示されるのは
              自前トラッカの値です。
            </div>

            {bizUsage.lastError && bizUsage.lastErrorAt && (
              <div className="mt-1 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-rose-700">
                <div className="mb-0.5 text-rose-500">
                  直近エラー (
                  {new Date(bizUsage.lastErrorAt).toLocaleString("ja-JP", {
                    hour12: false,
                  })}
                  )
                </div>
                <div className="break-words">{bizUsage.lastError}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="font-mono text-[11px] text-slate-400">loading…</div>
        )}
      </div>

      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
        ⚠ 数値は dev サーバ プロセス内の自前カウンタです。Tavily 側の
        ダッシュボード (<code>tavily.com</code>) で正確な月次クォータを
        確認してください。
      </div>
    </div>
  );
}
