"use client";

import { useCallback, useEffect, useState } from "react";
import { useMount } from "../../hooks/use-mount";
import {
  ApiErrorSchema,
  BizUsageSchema,
  ContainerStatusSchema,
  NetworkStatusSchema,
  SettingsResponseSchema,
  WorkspaceMinimalListSchema,
} from "@/lib/api-schemas";

export type BizUsage = {
  provider: string;
  monthKey: string;
  monthCount: number;
  sessionCount: number;
  cacheHitCount: number;
  cacheSize: number;
  lastErrorAt: number | null;
  lastError: string | null;
};

export type Provider = "llama-server" | "anthropic" | "openai";
export type CursorStyle = "bar" | "block" | "underline";

export type SettingsShape = {
  opencode: {
    provider: Provider;
    endpoint: string;
    model: string;
    apiKey: string; // UI では plain を保持
  };
  appearance: {
    defaultFontSize: number;
    defaultPanelWidth: number;
    defaultPanelHeight: number;
    cursorStyle: CursorStyle;
    scrollback: number;
  };
};

export type ContainerStatus = {
  exists: boolean;
  running: boolean;
  networkMode?: string;
  isolated?: boolean;
};

export type NetworkStatus = {
  requested: boolean;
  effective: boolean | null;
  networkMode: string | null;
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

export function useSettingsLoader({
  onResetContainer,
}: {
  onResetContainer: () => Promise<boolean>;
}) {
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

  const [rulesSyncing, setRulesSyncing] = useState(false);
  const [rulesSyncResult, setRulesSyncResult] = useState<string | null>(null);

  const [bizUsage, setBizUsage] = useState<BizUsage | null>(null);
  const [bizUsageLoading, setBizUsageLoading] = useState(false);

  const loadBizUsage = useCallback(async () => {
    setBizUsageLoading(true);
    try {
      const res = await fetch("/api/biz/usage", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBizUsage(BizUsageSchema.parse(await res.json()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBizUsageLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = SettingsResponseSchema.parse(await res.json());
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
      setContainerStatus(ContainerStatusSchema.parse(await res.json()));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadNetwork = useCallback(async () => {
    try {
      const res = await fetch("/api/user/network", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNetworkStatus(NetworkStatusSchema.parse(await res.json()));
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
          const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => ({})));
          throw new Error(parsed.success ? (parsed.data.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`);
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
  useMount(() => {
    void loadSettings();
    void loadContainer();
    void loadNetwork();
    void loadBizUsage();
  });

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const updateOpencode = useCallback(<K extends keyof SettingsShape["opencode"]>(
    key: K,
    value: SettingsShape["opencode"][K],
  ) => {
    setSettings((s) => (s ? { ...s, opencode: { ...s.opencode, [key]: value } } : s));
    setDirty(true);
  }, []);

  const updateAppearance = useCallback(<K extends keyof SettingsShape["appearance"]>(
    key: K,
    value: SettingsShape["appearance"][K],
  ) => {
    setSettings((s) => (s ? { ...s, appearance: { ...s.appearance, [key]: value } } : s));
    setDirty(true);
  }, []);

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
        const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => ({})));
        throw new Error(parsed.success ? (parsed.data.error ?? `HTTP ${res.status}`) : `HTTP ${res.status}`);
      }
      setDirty(false);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const syncAllRules = useCallback(async () => {
    if (rulesSyncing) return;
    setRulesSyncing(true);
    setRulesSyncResult(null);
    setError(null);
    try {
      const listRes = await fetch("/api/user/workspaces", { cache: "no-store" });
      if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
      const { workspaces } = WorkspaceMinimalListSchema.parse(await listRes.json());
      if (!workspaces.length) {
        setRulesSyncResult("対象ワークスペースなし");
        return;
      }
      let ok = 0;
      let fail = 0;
      for (const ws of workspaces) {
        const res = await fetch(
          `/api/user/workspaces/${encodeURIComponent(ws.id)}/sync-rules`,
          { method: "POST" },
        );
        if (res.ok) ok += 1;
        else fail += 1;
      }
      setRulesSyncResult(
        fail === 0
          ? `${ok}/${workspaces.length} 件すべて同期しました`
          : `成功 ${ok} 件 / 失敗 ${fail} 件`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRulesSyncing(false);
    }
  }, [rulesSyncing]);

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

  return {
    // 状態 (read)
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
    // 状態 (write)
    setSettings,
    setDirty,
    setApiKeyVisible,
    // アクション
    loadContainer,
    loadNetwork,
    toggleNetwork,
    updateOpencode,
    updateAppearance,
    save,
    syncAllRules,
    handleReset,
    loadBizUsage,
  };
}
