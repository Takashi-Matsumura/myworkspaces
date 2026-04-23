"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  Sliders,
  Palette,
  Container as ContainerIcon,
  Info,
  RefreshCw,
  Save,
  Check,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";

type Provider = "llama-server" | "anthropic" | "openai";

type SettingsShape = {
  opencode: {
    provider: Provider;
    endpoint: string;
    model: string;
    apiKey: string; // UI では plain を保持
  };
  appearance: {
    defaultFontSize: number;
  };
};

type ContainerStatus = {
  exists: boolean;
  running: boolean;
  networkMode?: string;
  isolated?: boolean;
};

type NetworkStatus = {
  requested: boolean;
  effective: boolean | null;
  networkMode: string | null;
};

type TabKey = "opencode" | "appearance" | "network" | "container" | "info";

const TABS: { key: TabKey; label: string; icon: typeof Sliders }[] = [
  { key: "opencode", label: "OpenCode", icon: Sliders },
  { key: "appearance", label: "外観", icon: Palette },
  { key: "network", label: "ネットワーク", icon: ShieldCheck },
  { key: "container", label: "コンテナ", icon: ContainerIcon },
  { key: "info", label: "情報", icon: Info },
];

const DEFAULT_MODELS: Record<Provider, string> = {
  "llama-server": "gemma-4-e4b-it-Q4_K_M.gguf",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
};

function decodeBase64(s: string): string {
  if (!s) return "";
  try {
    if (typeof window === "undefined") return "";
    return window.atob(s);
  } catch {
    return "";
  }
}

export default function SettingsPanel({
  onResetContainer,
}: {
  onResetContainer: () => Promise<boolean>; // returns true on success
}) {
  const [tab, setTab] = useState<TabKey>("opencode");
  const [settings, setSettings] = useState<SettingsShape | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const [containerStatus, setContainerStatus] = useState<ContainerStatus | null>(null);
  const [containerBusy, setContainerBusy] = useState(false);

  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { settings: SettingsShape };
      setSettings({
        ...data.settings,
        opencode: {
          ...data.settings.opencode,
          apiKey: decodeBase64(data.settings.opencode.apiKey),
        },
      });
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadContainer = useCallback(async () => {
    try {
      const res = await fetch("/api/container", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ContainerStatus;
      setContainerStatus(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadNetwork = useCallback(async () => {
    try {
      const res = await fetch("/api/user/network", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as NetworkStatus;
      setNetworkStatus(data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const toggleNetwork = useCallback(
    async (next: boolean) => {
      if (networkBusy) return;
      const msg = next
        ? "ネットワーク隔離を ON にします。コンテナが再作成され、実行中のターミナルはすべて閉じます。/root の作業ファイルは保持されます。続けますか？"
        : "ネットワーク隔離を OFF にします。コンテナが再作成され、実行中のターミナルはすべて閉じます。/root の作業ファイルは保持されます。続けますか？";
      if (typeof window !== "undefined" && !window.confirm(msg)) return;
      setNetworkBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/user/network", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isolated: next }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        await Promise.all([loadNetwork(), loadContainer()]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setNetworkBusy(false);
      }
    },
    [networkBusy, loadNetwork, loadContainer],
  );

  // 初回マウント時に 1 回だけ取得。
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void loadSettings();
    void loadContainer();
    void loadNetwork();
  }, [loadSettings, loadContainer, loadNetwork]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const updateOpencode = <K extends keyof SettingsShape["opencode"]>(
    key: K,
    value: SettingsShape["opencode"][K],
  ) => {
    setSettings((s) => (s ? { ...s, opencode: { ...s.opencode, [key]: value } } : s));
    setDirty(true);
  };

  const updateAppearance = <K extends keyof SettingsShape["appearance"]>(
    key: K,
    value: SettingsShape["appearance"][K],
  ) => {
    setSettings((s) => (s ? { ...s, appearance: { ...s.appearance, [key]: value } } : s));
    setDirty(true);
  };

  const save = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleReset = useCallback(async () => {
    if (containerBusy) return;
    setContainerBusy(true);
    try {
      const ok = await onResetContainer();
      if (ok) await loadContainer();
    } finally {
      setContainerBusy(false);
    }
  }, [containerBusy, loadContainer, onResetContainer]);

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
          </div>
        )}

        {tab === "appearance" && (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ターミナルのデフォルトフォントサイズ
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={28}
                  value={settings.appearance.defaultFontSize}
                  onChange={(e) => updateAppearance("defaultFontSize", Number(e.target.value))}
                  className="flex-1"
                />
                <span className="w-10 text-right font-mono text-xs text-slate-700">
                  {settings.appearance.defaultFontSize}px
                </span>
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                既存のターミナルは個別に保存されたサイズを使います。新しく開くターミナルにこの値が適用されます。
              </p>
            </div>
          </div>
        )}

        {tab === "network" && (
          <div className="flex flex-col gap-3">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">ネットワーク隔離</span>
                <button
                  type="button"
                  onClick={() => void loadNetwork()}
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
                      onClick={() => void toggleNetwork(!networkStatus.requested)}
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
        )}

        {tab === "container" && (
          <div className="flex flex-col gap-3">
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">コンテナ状態</span>
                <button
                  type="button"
                  onClick={() => void loadContainer()}
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
                onClick={() => void handleReset()}
                disabled={containerBusy}
                className="inline-flex items-center gap-1 rounded border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${containerBusy ? "animate-spin" : ""}`} />
                {containerBusy ? "作り直し中…" : "コンテナを作り直す"}
              </button>
            </div>
          </div>
        )}

        {tab === "info" && (
          <div className="flex flex-col gap-2 font-mono text-[11px] text-slate-600">
            <div className="flex gap-2">
              <span className="w-24 text-slate-400">sub</span>
              <span>demo</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 text-slate-400">image</span>
              <span>myworkspaces-sandbox:latest</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 text-slate-400">container</span>
              <span>myworkspaces-shell-demo</span>
            </div>
            <div className="flex gap-2">
              <span className="w-24 text-slate-400">volume</span>
              <span>myworkspaces-home-demo</span>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              <a
                href="https://github.com/Takashi-Matsumura/myworkspaces"
                target="_blank"
                rel="noreferrer"
                className="text-sky-700 hover:underline"
              >
                GitHub: Takashi-Matsumura/myworkspaces
              </a>
              <a
                href="https://opencode.ai/"
                target="_blank"
                rel="noreferrer"
                className="text-sky-700 hover:underline"
              >
                OpenCode
              </a>
            </div>
          </div>
        )}
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
