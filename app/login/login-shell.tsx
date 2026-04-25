"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Info, X } from "lucide-react";
import LoginForm from "./login-form";

// ログイン画面のレイアウトと「アプリ説明」の表示トグルを担う Client ラッパー。
// 説明文の中身は Server 側で MD を読んで about prop で渡す (本コンポーネントは
// 表示状態だけ管理する)。デフォルト非表示で、フォーム右上の Info ボタンで開閉。
export default function LoginShell({ about }: { about: string }) {
  const [showAbout, setShowAbout] = useState(false);
  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-50 px-4 py-8">
      <div className="flex w-full max-w-4xl flex-col-reverse items-center gap-8 md:flex-row md:items-start md:justify-center">
        {showAbout && (
          <section className="prose prose-sm prose-neutral relative max-w-none flex-1 md:max-w-md md:py-2">
            <button
              type="button"
              onClick={() => setShowAbout(false)}
              className="absolute right-0 top-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              title="説明を閉じる"
            >
              <X className="h-4 w-4" />
            </button>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{about}</ReactMarkdown>
          </section>
        )}
        <div className="relative">
          {!showAbout && (
            <button
              type="button"
              onClick={() => setShowAbout(true)}
              className="absolute -right-3 -top-3 z-10 rounded-full border border-neutral-200 bg-white p-2 text-neutral-500 shadow-sm hover:text-neutral-800"
              title="myworkspaces について"
              aria-label="アプリの説明を表示"
            >
              <Info className="h-4 w-4" />
            </button>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
