"use client";

// Phase 3: ロープ一覧の取得 + 作成 / 更新 / 削除 をまとめるフック。
// /api/a2a/ropes と /api/a2a/ropes/[id] を叩くだけで、
// 状態を持つ複雑なロジック (busy/idle 反映など) は backend listener 任せ。

import { useCallback, useEffect, useState } from "react";
import type { A2APanel } from "@/lib/a2a/prefix";

export type Rope = {
  id: string;
  userId: string;
  fromPanel: A2APanel;
  toPanel: A2APanel;
  fromSessionId: string;
  toSessionId: string;
  hopLimit: number;
  active: boolean;
  createdAt: string;
};

type CreateRopeInput = {
  fromPanel: A2APanel;
  toPanel: A2APanel;
  fromSessionId: string;
  toSessionId: string;
  hopLimit?: number;
};

export function useRopes() {
  const [ropes, setRopes] = useState<Rope[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/a2a/ropes", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { ropes: Rope[] };
      setRopes(data.ropes);
      setLoaded(true);
    } catch {
      // 取得失敗時は前回の状態を保持
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (input: CreateRopeInput): Promise<Rope | null> => {
      const res = await fetch("/api/a2a/ropes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { rope: Rope };
      setRopes((prev) => [data.rope, ...prev]);
      return data.rope;
    },
    [],
  );

  const update = useCallback(
    async (id: string, patch: { active?: boolean; hopLimit?: number }) => {
      const res = await fetch(`/api/a2a/ropes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { rope: Rope };
      setRopes((prev) => prev.map((r) => (r.id === id ? data.rope : r)));
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/a2a/ropes/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setRopes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const stopAll = useCallback(async () => {
    const res = await fetch("/api/a2a/stop-all", { method: "POST" });
    if (!res.ok) return;
    await refresh();
  }, [refresh]);

  return { ropes, loaded, refresh, create, update, remove, stopAll };
}
