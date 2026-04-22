"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "リクエストに失敗しました");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-xl shadow-sm p-8">
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">myworkspaces</h1>
        <p className="text-sm text-neutral-500 mb-6">
          {mode === "login" ? "ログイン" : "新規アカウント登録"}
        </p>

        <div className="flex rounded-md bg-neutral-100 p-1 mb-6 text-sm">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded ${
              mode === "login"
                ? "bg-white shadow-sm text-neutral-900"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            ログイン
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded ${
              mode === "register"
                ? "bg-white shadow-sm text-neutral-900"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              ユーザ名
            </label>
            <input
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400"
              placeholder={mode === "register" ? "3〜32 文字の英数字 / _ . -" : ""}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              パスワード
            </label>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400"
              placeholder={mode === "register" ? "8 文字以上" : ""}
            />
          </div>

          {error ? (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-neutral-900 text-white text-sm font-medium py-2 rounded-md hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy
              ? "処理中..."
              : mode === "login"
              ? "ログイン"
              : "アカウントを作成"}
          </button>
        </form>
      </div>
    </main>
  );
}
