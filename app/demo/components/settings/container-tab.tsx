"use client";

import { RefreshCw } from "lucide-react";
import type { ContainerStatus } from "./use-settings-loader";

type Props = {
  containerStatus: ContainerStatus | null;
  containerBusy: boolean;
  loadContainer: () => void;
  handleReset: () => void;
};

export function ContainerTab({
  containerStatus,
  containerBusy,
  loadContainer,
  handleReset,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">コンテナ状態</span>
          <button
            type="button"
            onClick={loadContainer}
            className="rounded p-1 text-slate-500 hover:bg-white"
            title="再取得"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        {containerStatus ? (
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span
              className={`h-2 w-2 rounded-full ${
                containerStatus.running
                  ? "bg-emerald-500"
                  : containerStatus.exists
                    ? "bg-amber-400"
                    : "bg-slate-300"
              }`}
            />
            <span className="text-slate-700">
              {containerStatus.running
                ? "running"
                : containerStatus.exists
                  ? "stopped"
                  : "not created"}
            </span>
          </div>
        ) : (
          <div className="font-mono text-[11px] text-slate-400">loading…</div>
        )}
      </div>

      <div className="rounded border border-rose-200 bg-rose-50 p-3">
        <div className="mb-1 text-xs font-medium text-rose-800">コンテナを作り直す</div>
        <p className="mb-2 text-[11px] text-rose-700">
          <code>/root</code> の named volume（ワークスペース実体）は保持されますが、
          コンテナ内で <code>apt install</code> した追加パッケージや <code>/tmp</code> 等はすべて失われます。
          アクティブなターミナルもすべて閉じます。
        </p>
        <button
          type="button"
          onClick={handleReset}
          disabled={containerBusy}
          className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${containerBusy ? "animate-spin" : ""}`} />
          {containerBusy ? "作り直し中…" : "コンテナを作り直す"}
        </button>
      </div>
    </div>
  );
}
