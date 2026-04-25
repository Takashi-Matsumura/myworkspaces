"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Info, ArrowLeft } from "lucide-react";
import LoginForm from "./login-form";

// ログイン画面のレイアウトと「アプリ説明」のフリップ表示を担う Client ラッパー。
// 表面 = LoginForm、裏面 = MD でレンダリングしたアプリ説明。3D rotateY で
// 切り替える (Code/Biz パネルと同じフリップ体験)。
//
// 表面と裏面の高さを揃えるため CSS Grid の同一セル重ね (col-start-1 row-start-1)
// を使い、コンテナ高さは max(front, back) になる。フリップ中の interactivity は
// backfaceVisibility: hidden に依存。
export default function LoginShell({ about }: { about: string }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-50 px-4 py-8">
      <div className="w-full max-w-sm" style={{ perspective: 1200 }}>
        <div
          className="relative"
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.6s ease-in-out",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          <div className="grid grid-cols-1 grid-rows-1">
            {/* Front: ログインフォーム */}
            <div
              className="col-start-1 row-start-1 relative"
              style={{ backfaceVisibility: "hidden" }}
            >
              <button
                type="button"
                onClick={() => setFlipped(true)}
                className="absolute -right-3 -top-3 z-10 rounded-full border border-neutral-200 bg-white p-2 text-neutral-500 shadow-sm hover:text-neutral-800"
                title="myworkspaces について"
                aria-label="アプリの説明を表示"
              >
                <Info className="h-4 w-4" />
              </button>
              <LoginForm />
            </div>

            {/* Back: アプリ説明 */}
            <div
              className="col-start-1 row-start-1"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              <div className="relative w-full bg-white border border-neutral-200 rounded-xl shadow-sm p-8 h-full">
                <button
                  type="button"
                  onClick={() => setFlipped(false)}
                  className="absolute right-3 top-3 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  title="ログインに戻る"
                  aria-label="ログインに戻る"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="prose prose-sm prose-neutral max-w-none pr-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {about}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
