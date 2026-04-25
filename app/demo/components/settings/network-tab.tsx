"use client";

import { RefreshCw } from "lucide-react";
import type { NetworkStatus } from "./use-settings-loader";

type Props = {
  networkStatus: NetworkStatus | null;
  networkBusy: boolean;
  loadNetwork: () => void;
  toggleNetwork: (next: boolean) => void;
};

export function NetworkTab({ networkStatus, networkBusy, loadNetwork, toggleNetwork }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600">ネットワーク隔離</span>
          <button
            type="button"
            onClick={loadNetwork}
            className="rounded p-1 text-slate-500 hover:bg-white"
            title="再取得"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {networkStatus ? (
          <>
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleNetwork(!networkStatus.requested)}
                disabled={networkBusy}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  networkStatus.requested ? "bg-emerald-500" : "bg-slate-300"
                } disabled:opacity-50`}
                role="switch"
                aria-checked={networkStatus.requested}
                title={networkStatus.requested ? "ON → OFF" : "OFF → ON"}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    networkStatus.requested ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div className="font-mono text-[11px] text-slate-700">
                {networkBusy
                  ? "切り替え中…"
                  : networkStatus.requested
                    ? "隔離: ON"
                    : "隔離: OFF"}
              </div>
            </div>

            <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
              ON にするとコンテナから <code>example.com</code> などの外部インター
              ネットには到達できなくなります。ホスト上の llama-server
              (<code>host.docker.internal:8080</code>) への接続は引き続き可能です。
              ただし Claude Code など、ホスト外の API
              (<code>api.anthropic.com</code> 等) を必要とするツールは隔離 ON では
              利用できません。
            </p>

            <div className="mt-2 flex flex-col gap-1 font-mono text-[10px] text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-16 text-slate-400">設定値</span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    networkStatus.requested ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                />
                <span>{networkStatus.requested ? "ON" : "OFF"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-slate-400">実効</span>
                <span
                  className={`h-2 w-2 rounded-full ${
                    networkStatus.effective === null
                      ? "bg-slate-300"
                      : networkStatus.effective
                        ? "bg-emerald-500"
                        : "bg-slate-400"
                  }`}
                />
                <span>
                  {networkStatus.effective === null
                    ? "コンテナ未作成 (次回起動で反映)"
                    : networkStatus.effective
                      ? "ON"
                      : "OFF"}
                </span>
              </div>
              {networkStatus.networkMode && (
                <div className="flex items-center gap-2">
                  <span className="w-16 text-slate-400">network</span>
                  <span>{networkStatus.networkMode}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="font-mono text-[11px] text-slate-400">loading…</div>
        )}
      </div>

      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
        ⚠ 切り替えるとコンテナが再作成され、実行中のターミナルはすべて閉じます。
        <code>/root</code> のファイルは named volume に保存されているため失われません。
      </div>
    </div>
  );
}
