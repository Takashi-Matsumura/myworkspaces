"use client";

// Phase 3: relay の発生を polling で検知してパケットアニメーション用のキーを返す。
// 厳密な realtime は不要 (アニメは演出)。各 active rope を 4s 間隔で polling し、
// delivered=true な最新メッセージの id を抽出する。新しい id が来たら
// ropeId → { messageId, fromPanel } を更新 → RopeLayer の <animateMotion> が再走する。

import { useEffect, useRef, useState } from "react";
import type { A2APanel } from "@/lib/a2a/prefix";
import type { Rope } from "./use-ropes";

export type RopeActivity = {
  messageId: string;
  fromPanel: A2APanel;
};

type A2AMessageRow = {
  id: string;
  ropeId: string;
  fromPanel: string;
  hopCount: number;
  delivered: boolean;
  createdAt: string;
};

const POLL_MS = 4000;

export function useRopeActivity(ropes: Rope[]): Record<string, RopeActivity | undefined> {
  const [activity, setActivity] = useState<Record<string, RopeActivity | undefined>>({});
  // 1 度処理した messageId を覚えておき、二重に再アニメさせない
  const seenRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (ropes.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      // active な rope のみ polling 対象
      const active = ropes.filter((r) => r.active);
      await Promise.all(
        active.map(async (rope) => {
          try {
            const res = await fetch(`/api/a2a/ropes/${rope.id}/messages`, {
              cache: "no-store",
            });
            if (!res.ok) return;
            const { messages } = (await res.json()) as { messages: A2AMessageRow[] };
            const delivered = messages.find((m) => m.delivered);
            if (!delivered) return;
            if (seenRef.current.get(rope.id) === delivered.id) return;
            seenRef.current.set(rope.id, delivered.id);
            if (cancelled) return;
            if (delivered.fromPanel !== "biz" && delivered.fromPanel !== "code") return;
            setActivity((prev) => ({
              ...prev,
              [rope.id]: {
                messageId: delivered.id,
                fromPanel: delivered.fromPanel as A2APanel,
              },
            }));
          } catch {
            // 失敗時は次回 poll で再試行
          }
        }),
      );
    };
    void tick();
    const handle = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [ropes]);

  return activity;
}
