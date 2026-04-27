"use client";

import { useState } from "react";
import {
  Settings as SettingsIcon,
  Sliders,
  Palette,
  Container as ContainerIcon,
  Info,
  Save,
  Check,
  ShieldCheck,
  Briefcase,
} from "lucide-react";
import { useSettingsLoader } from "./settings/use-settings-loader";
import { OpencodeTab } from "./settings/opencode-tab";
import { AppearanceTab } from "./settings/appearance-tab";
import { NetworkTab } from "./settings/network-tab";
import { ContainerTab } from "./settings/container-tab";
import { InfoTab } from "./settings/info-tab";
import { BizTab } from "./settings/biz-tab";

type TabKey = "opencode" | "appearance" | "network" | "container" | "biz" | "info";

const TABS: { key: TabKey; label: string; icon: typeof Sliders }[] = [
  { key: "opencode", label: "OpenCode", icon: Sliders },
  { key: "appearance", label: "外観", icon: Palette },
  { key: "network", label: "ネットワーク", icon: ShieldCheck },
  { key: "container", label: "コンテナ", icon: ContainerIcon },
  { key: "biz", label: "Biz", icon: Briefcase },
  { key: "info", label: "情報", icon: Info },
];

export default function SettingsPanel({
  onResetContainer,
}: {
  onResetContainer: () => Promise<boolean>;
}) {
  const [tab, setTab] = useState<TabKey>("opencode");
  const {
    settings,
    dirty,
    saving,
    saved,
    error,
    apiKeyVisible,
    containerStatus,
    containerBusy,
    networkStatus,
    networkBusy,
    rulesSyncing,
    rulesSyncResult,
    bizUsage,
    bizUsageLoading,
    setSettings,
    setDirty,
    setApiKeyVisible,
    loadContainer,
    loadNetwork,
    toggleNetwork,
    updateOpencode,
    updateAppearance,
    save,
    syncAllRules,
    handleReset,
    loadBizUsage,
  } = useSettingsLoader({ onResetContainer });

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center font-mono text-xs text-slate-400">
        loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* タブバー */}
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-300"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="border-b border-rose-200 bg-rose-50 px-3 py-1 font-mono text-[11px] text-rose-700">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {tab === "opencode" && (
          <OpencodeTab
            settings={settings}
            setSettings={setSettings}
            setDirty={setDirty}
            updateOpencode={updateOpencode}
            apiKeyVisible={apiKeyVisible}
            setApiKeyVisible={setApiKeyVisible}
            rulesSyncing={rulesSyncing}
            rulesSyncResult={rulesSyncResult}
            syncAllRules={() => void syncAllRules()}
          />
        )}

        {tab === "appearance" && (
          <AppearanceTab settings={settings} updateAppearance={updateAppearance} />
        )}

        {tab === "network" && (
          <NetworkTab
            networkStatus={networkStatus}
            networkBusy={networkBusy}
            loadNetwork={() => void loadNetwork()}
            toggleNetwork={(next) => void toggleNetwork(next)}
          />
        )}

        {tab === "container" && (
          <ContainerTab
            containerStatus={containerStatus}
            containerBusy={containerBusy}
            loadContainer={() => void loadContainer()}
            handleReset={() => void handleReset()}
          />
        )}

        {tab === "biz" && (
          <BizTab
            bizUsage={bizUsage}
            bizUsageLoading={bizUsageLoading}
            loadBizUsage={() => void loadBizUsage()}
          />
        )}

        {tab === "info" && <InfoTab />}
      </div>

      {/* 保存バー */}
      {(tab === "opencode" || tab === "appearance") && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2">
          {saved && (
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700">
              <Check className="h-3 w-3" />
              保存しました
            </span>
          )}
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1 rounded border border-sky-500 bg-sky-500 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-sky-600 disabled:border-slate-300 disabled:bg-slate-300"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      )}
    </div>
  );
}

export { SettingsIcon };
