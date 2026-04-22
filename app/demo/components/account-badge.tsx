"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

type Me = { id: string; username: string } | null;

export function AccountBadge() {
  const router = useRouter();
  const [me, setMe] = useState<Me>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
  }, []);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
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
  );
}
