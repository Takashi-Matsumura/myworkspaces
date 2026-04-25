"use client";

import { Eye, EyeOff, RefreshCw } from "lucide-react";
import type { Provider, SettingsShape } from "./use-settings-loader";

const DEFAULT_MODELS: Record<Provider, string> = {
  "llama-server": "gemma-4-e4b-it-Q4_K_M.gguf",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
};

type Props = {
  settings: SettingsShape;
  setSettings: (updater: (s: SettingsShape | null) => SettingsShape | null) => void;
  setDirty: (v: boolean) => void;
  updateOpencode: <K extends keyof SettingsShape["opencode"]>(
    key: K,
    value: SettingsShape["opencode"][K],
  ) => void;
  apiKeyVisible: boolean;
  setApiKeyVisible: (updater: (v: boolean) => boolean) => void;
  rulesSyncing: boolean;
  rulesSyncResult: string | null;
  syncAllRules: () => void;
};

export function OpencodeTab({
  settings,
  setSettings,
  setDirty,
  updateOpencode,
  apiKeyVisible,
  setApiKeyVisible,
  rulesSyncing,
  rulesSyncResult,
  syncAllRules,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Provider</label>
        <select
          value={settings.opencode.provider}
          onChange={(e) => {
            const p = e.target.value as Provider;
            setSettings((s) =>
              s
                ? {
                    ...s,
                    opencode: {
                      ...s.opencode,
                      provider: p,
                      model: s.opencode.model || DEFAULT_MODELS[p],
                    },
                  }
                : s,
            );
            setDirty(true);
          }}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:border-sky-400 focus:outline-none"
        >
          <option value="llama-server">llama-server (local)</option>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>
        <p className="mt-1 text-[10px] text-slate-400">
          この設定は新規作成するワークスペースの <code>opencode.json</code> に反映されます（既存のものは変わりません）。
        </p>
      </div>

      {settings.opencode.provider === "llama-server" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Endpoint URL</label>
          <input
            type="text"
            value={settings.opencode.endpoint}
            onChange={(e) => updateOpencode("endpoint", e.target.value)}
            placeholder="http://host.docker.internal:8080"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:border-sky-400 focus:outline-none"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            コンテナからホストの llama-server に到達するパス。末尾に <code>/v1</code> は付けない。
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Model</label>
        <input
          type="text"
          value={settings.opencode.model}
          onChange={(e) => updateOpencode("model", e.target.value)}
          placeholder={DEFAULT_MODELS[settings.opencode.provider]}
          className="w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:border-sky-400 focus:outline-none"
        />
      </div>

      {(settings.opencode.provider === "anthropic" ||
        settings.opencode.provider === "openai") && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">API Key</label>
          <div className="flex gap-1">
            <input
              type={apiKeyVisible ? "text" : "password"}
              value={settings.opencode.apiKey}
              onChange={(e) => updateOpencode("apiKey", e.target.value)}
              placeholder={settings.opencode.provider === "anthropic" ? "sk-ant-..." : "sk-..."}
              className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-800 focus:border-sky-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setApiKeyVisible((v) => !v)}
              className="shrink-0 rounded border border-slate-300 px-2 text-slate-500 hover:bg-slate-50"
              title={apiKeyVisible ? "非表示" : "表示"}
            >
              {apiKeyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <p className="mt-1 text-[10px] text-amber-600">
            ⚠ base64 エンコードのみで保存されます（暗号化ではありません）。
          </p>
        </div>
      )}

      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3">
        <div className="mb-1 text-xs font-medium text-slate-700">ルールファイルの同期</div>
        <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
          テンプレートの <code>*-rules.md</code>（language / vision / business / pdf / coding）を
          既存の全ワークスペースに上書き配布し、<code>opencode.json</code> の
          <code>instructions</code> と <code>agent</code>（plan/build の temperature・top_p）の
          不足分も追加します。既存の個別設定値は保持されます。
        </p>
        <button
          type="button"
          onClick={syncAllRules}
          disabled={rulesSyncing}
          className="inline-flex items-center gap-1 rounded border border-sky-300 bg-white px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${rulesSyncing ? "animate-spin" : ""}`} />
          {rulesSyncing ? "同期中…" : "ルールを最新テンプレートに同期"}
        </button>
        {rulesSyncResult && (
          <div className="mt-2 font-mono text-[11px] text-emerald-700">
            {rulesSyncResult}
          </div>
        )}
      </div>
    </div>
  );
}
