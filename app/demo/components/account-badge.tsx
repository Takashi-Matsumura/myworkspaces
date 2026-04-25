"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { useMount } from "../hooks/use-mount";

type Me = { id: string; username: string } | null;

export function AccountBadge() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  // loggingOut: API 通信中 (コンテナ停止含む)
  // transitioning: /login へ遷移中 (ページ unmount までロックを維持)
  const [loggingOut, setLoggingOut] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [mounted, setMounted] = useState(false);
  const busy = loggingOut || transitioning;

  useMount(() => {
    // SSR ガード: portal を使うには document にアクセス可能になってからレンダする必要がある
    setMounted(true);
    let cancel = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!cancel) setMe((data?.user as Me) ?? null);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  });

  async function logout() {
    if (busy) return;
    setLoggingOut(true);
    // オーバーレイが paint されるのを 1 フレーム待ってから通信を始める。
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const startedAt = performance.now();
    const MIN_MS = 400;
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Cookie は破棄されているはずなので、失敗しても /login に遷移する
    }
    const elapsed = performance.now() - startedAt;
    if (elapsed < MIN_MS) {
      await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
    }
    setTransitioning(true);
    router.replace("/login");
    router.refresh();
  }

  // 祖先の footer に backdrop-blur が効いていると、fixed 子孫が
  // ビューポートでなく footer を基準に positioning されてしまう (CSS 仕様)。
  // document.body 直下に portal して回避。
  const overlay = busy ? (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm cursor-wait"
    >
      <div className="flex items-center gap-3 rounded-lg bg-white border border-neutral-200 shadow-lg px-5 py-4">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-700" />
        <span className="text-sm text-neutral-800">
          {loggingOut
            ? "ログアウトしています..."
            : "ログイン画面に戻っています..."}
        </span>
      </div>
    </div>
  ) : null;

  return (
    <>
      <span className="flex items-center gap-1 font-mono text-[10px] text-slate-500">
        <span>{me ? me.username : "…"}</span>
        <button
          type="button"
          onClick={logout}
          disabled={busy || !me}
          title="ログアウト"
          className="inline-flex items-center rounded p-0.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          <LogOut className="h-3 w-3" />
        </button>
      </span>
      {mounted && overlay ? createPortal(overlay, document.body) : null}
    </>
  );
}
