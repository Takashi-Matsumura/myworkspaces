import Link from "next/link";

// パスワードリセット機能は未実装。ログイン画面のリンクから来たユーザに
// 「現在準備中」を伝えるだけのプレースホルダーページ。
// メール送信などの動的フローを必要としないため Server Component のまま。
export default function ForgotPasswordPage() {
  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm bg-white border border-neutral-200 rounded-xl shadow-sm p-8">
        <h1 className="text-xl font-semibold text-neutral-900 mb-1">myworkspaces</h1>
        <p className="text-sm text-neutral-500 mb-6">パスワードを忘れた</p>

        <p className="text-sm text-neutral-700 leading-relaxed">
          パスワードリセット機能は現在準備中です。アカウント情報の復旧については
          管理者までお問い合わせください。
        </p>

        <div className="mt-6 pt-4 border-t border-dashed border-neutral-200 text-xs text-neutral-500">
          <Link
            href="/login"
            className="text-neutral-700 underline-offset-2 hover:text-neutral-900 hover:underline"
          >
            ← ログイン画面に戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
