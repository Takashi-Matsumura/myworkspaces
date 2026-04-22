"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Mode = "login" | "register";

// デモ用サンプルアカウント。
// demo/demo は scripts/seed-demo-user.mjs で作成。
// alice / bob は Phase 2 開発中に curl で登録した E2E テスト用。
// 本物のパスワード管理ではないので、ここに平文で載せてよい。
const DEMO_ACCOUNTS: Array<{ username: string; password: string }> = [
  { username: "demo", password: "demo" },
  { username: "alice", password: "securepass123" },
  { username: "bob", password: "hunter2bob" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // submitting: API 通信中 (エラー時は解除)
  // transitioning: ログイン成功後、/ の重い初期化 (Excalidraw 等) が終わるまで解除しない
  const [submitting, setSubmitting] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const busy = submitting || transitioning;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSubmitting(true);
    // オーバーレイがブラウザに paint されるのを 1 フレーム待ってから fetch を開始する。
    // これを挟まないと localhost の高速 API (〜100ms) では commit と
    // router.replace が詰まり、スピナーがほぼ表示されないまま画面が切り替わる。
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const startedAt = performance.now();
    const MIN_MS = 400; // 速すぎる応答でもスピナーが一瞬見えるように下限を設ける

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const elapsed = performance.now() - startedAt;
      if (elapsed < MIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "リクエストに失敗しました");
        setSubmitting(false);
        return;
      }
      // 成功時は submitting を解除せず transitioning に移す。
      // router.replace の完了 (= このページの unmount) までオーバーレイを出し続ける。
      setTransitioning(true);
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message ?? "ネットワークエラー");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-50 px-4">
      <div
        className={`w-full max-w-sm bg-white border border-neutral-200 rounded-xl shadow-sm p-8 transition-opacity ${
          busy ? "opacity-60" : ""
        }`}
      >
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">myworkspaces</h1>
        <p className="text-sm text-neutral-500 mb-6">
          {mode === "login" ? "ログイン" : "新規アカウント登録"}
        </p>

        <div className="flex rounded-md bg-neutral-100 p-1 mb-6 text-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded ${
              mode === "login"
                ? "bg-white shadow-sm text-neutral-900"
                : "text-neutral-500 hover:text-neutral-700"
            } disabled:cursor-not-allowed`}
          >
            ログイン
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 py-1.5 rounded ${
              mode === "register"
                ? "bg-white shadow-sm text-neutral-900"
                : "text-neutral-500 hover:text-neutral-700"
            } disabled:cursor-not-allowed`}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
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
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 disabled:bg-neutral-100"
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
                className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 disabled:bg-neutral-100"
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
              className="w-full bg-neutral-900 text-white text-sm font-medium py-2 rounded-md hover:bg-neutral-700 disabled:opacity-70 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              <span>
                {submitting
                  ? "認証中..."
                  : transitioning
                  ? "読み込み中..."
                  : mode === "login"
                  ? "ログイン"
                  : "アカウントを作成"}
              </span>
            </button>
          </fieldset>
        </form>

        {mode === "login" ? (
          <div className="mt-6 pt-4 border-t border-dashed border-neutral-200">
            <p className="text-[11px] font-medium text-neutral-500 mb-2">
              デモ用アカウント <span className="text-neutral-400">(クリックで入力)</span>
            </p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.username}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setUsername(a.username);
                      setPassword(a.password);
                      setError(null);
                    }}
                    className="w-full inline-flex items-center justify-between gap-2 rounded px-2 py-1 font-mono text-[11px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-neutral-800">{a.username}</span>
                    <span className="text-neutral-400">/</span>
                    <span className="flex-1 text-left">{a.password}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {busy ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm cursor-wait"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 rounded-lg bg-white border border-neutral-200 shadow-lg px-5 py-4">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-700" />
            <span className="text-sm text-neutral-800">
              {submitting ? "認証しています..." : "ワークスペースを読み込んでいます..."}
            </span>
          </div>
        </div>
      ) : null}
    </main>
  );
}
