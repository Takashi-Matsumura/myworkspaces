"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PartInfo } from "./use-opencode-stream";

type MessageLite = { id: string; role: string; partIds: string[] };

// busy の立ち上がり / 立ち下がり・llama-server /tokenize 呼び出し・
// コンテキスト利用率・statusLine 文字列生成。ChatThread (Business) と
// CodingConsole の双方から同じロジックで呼べるよう切り出した共通 hook。
// 挙動は元の ChatThread 内実装と等価。
export function useStreamStats({
  sessionId,
  messages,
  parts,
  busy,
}: {
  sessionId: string | null;
  messages: MessageLite[];
  parts: Record<string, PartInfo>;
  busy: boolean;
}): { statusLine: string } {
  const totalChars = useMemo(
    () =>
      messages.reduce(
        (n, m) =>
          n + m.partIds.reduce((k, pid) => k + (parts[pid]?.text?.length ?? 0), 0),
        0,
      ),
    [messages, parts],
  );

  const busyStartRef = useRef<{ at: number; chars: number } | null>(null);
  const [lastRun, setLastRun] = useState<{
    chars: number;
    seconds: number;
    tokens: number | null;
  } | null>(null);
  const [contextWindow, setContextWindow] = useState<number | null>(null);
  const [sessionTokens, setSessionTokens] = useState<number | null>(null);

  // llama-server /props からコンテキストウィンドウを 1 度だけ取得。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch("/api/opencode/llama-stats");
        if (!resp.ok) return;
        const j = (await resp.json()) as { contextWindow?: number };
        if (!cancelled && typeof j.contextWindow === "number") {
          setContextWindow(j.contextWindow);
        }
      } catch {
        // llama-server に届かないときは無表示で妥協する。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // busy 中は 300ms 刻みで経過時間を再描画するためのダミー tick。
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, [busy]);

  // 最新の assistant 応答テキストとセッション全文を ref で参照可能に保つ。
  const latestAssistantTextRef = useRef("");
  const latestSessionTextRef = useRef("");
  useEffect(() => {
    let assistant = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== "user") {
        assistant = messages[i].partIds
          .map((pid) => parts[pid]?.text ?? "")
          .join("");
        break;
      }
    }
    latestAssistantTextRef.current = assistant;
    latestSessionTextRef.current = messages
      .flatMap((m) => m.partIds.map((pid) => parts[pid]?.text ?? ""))
      .join("\n");
  }, [messages, parts]);

  // busy の立ち上がり / 立ち下がりで snapshot を更新し、完了時に /tokenize。
  useEffect(() => {
    if (busy) {
      if (!busyStartRef.current) {
        busyStartRef.current = { at: Date.now(), chars: totalChars };
      }
      return;
    }
    if (!busyStartRef.current) return;
    const seconds = (Date.now() - busyStartRef.current.at) / 1000;
    const chars = Math.max(0, totalChars - busyStartRef.current.chars);
    setLastRun({ chars, seconds, tokens: null });
    busyStartRef.current = null;

    const assistant = latestAssistantTextRef.current;
    if (assistant) {
      void (async () => {
        try {
          const resp = await fetch("/api/opencode/llama-stats", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: assistant }),
          });
          if (!resp.ok) return;
          const j = (await resp.json()) as { count?: number };
          if (typeof j.count === "number") {
            setLastRun((prev) =>
              prev ? { ...prev, tokens: j.count ?? null } : prev,
            );
          }
        } catch {
          /* 失敗時は lastRun.tokens は null のまま */
        }
      })();
    }
    const session = latestSessionTextRef.current;
    if (session) {
      void (async () => {
        try {
          const resp = await fetch("/api/opencode/llama-stats", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: session }),
          });
          if (!resp.ok) return;
          const j = (await resp.json()) as { count?: number };
          if (typeof j.count === "number") setSessionTokens(j.count);
        } catch {
          /* ignore */
        }
      })();
    }
  }, [busy, totalChars]);

  // セッションを切り替えたら前回の統計を持ち越さない。
  useEffect(() => {
    setLastRun(null);
    setSessionTokens(null);
    busyStartRef.current = null;
  }, [sessionId]);

  const tokenRatio =
    lastRun && lastRun.tokens && lastRun.chars > 0
      ? lastRun.tokens / lastRun.chars
      : 0.5;

  const fmt = (n: number) => n.toLocaleString("en-US");
  const ctxBadge =
    sessionTokens !== null && contextWindow
      ? ` · コンテキスト ${fmt(sessionTokens)} / ${fmt(contextWindow)} (${(
          (sessionTokens / contextWindow) *
          100
        ).toFixed(1)}%)`
      : contextWindow && !sessionTokens
        ? ` · コンテキスト ${fmt(contextWindow)} 上限`
        : "";

  let statusLine: string;
  if (busy && busyStartRef.current) {
    const seconds = Math.max(
      0.001,
      (Date.now() - busyStartRef.current.at) / 1000,
    );
    const chars = Math.max(0, totalChars - busyStartRef.current.chars);
    const estTokens = Math.round(chars * tokenRatio);
    const rate = estTokens / seconds;
    statusLine = `⚡ 生成中 · ~${fmt(estTokens)} トークン · ${seconds.toFixed(1)}s · ~${rate.toFixed(1)} トークン/秒${ctxBadge}`;
  } else if (lastRun && lastRun.tokens && lastRun.tokens > 0) {
    const rate = lastRun.tokens / Math.max(0.001, lastRun.seconds);
    statusLine = `直近の応答 · ${fmt(lastRun.tokens)} トークン · ${lastRun.seconds.toFixed(1)}s · ${rate.toFixed(1)} トークン/秒${ctxBadge}`;
  } else if (lastRun && lastRun.chars > 0) {
    const estTokens = Math.round(lastRun.chars * tokenRatio);
    statusLine = `直近の応答 · ~${fmt(estTokens)} トークン · ${lastRun.seconds.toFixed(1)}s (計測中…)${ctxBadge}`;
  } else if (totalChars > 0) {
    statusLine = `セッション継続中${ctxBadge || ` · ${messages.length} メッセージ`}`;
  } else if (contextWindow) {
    statusLine = `新しい会話を始めましょう · コンテキスト上限 ${fmt(contextWindow)} トークン`;
  } else {
    statusLine = "新しい会話を始めましょう";
  }

  return { statusLine };
}
