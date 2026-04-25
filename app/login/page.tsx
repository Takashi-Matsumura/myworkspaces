import fs from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import LoginForm from "./login-form";

// ログイン画面の左側に並べるアプリ説明文。Markdown ファイルとして
// `app/login/about.md` に置き、ここで読み込む。文章の更新は md だけ
// 編集すれば良いように。Server Component なので fs から同期読み込みで OK。
function loadAbout(): string {
  return fs.readFileSync(path.join(process.cwd(), "app/login/about.md"), "utf-8");
}

export default function LoginPage() {
  const about = loadAbout();
  return (
    <main className="flex-1 flex items-center justify-center bg-neutral-50 px-4 py-8">
      <div className="flex w-full max-w-4xl flex-col-reverse items-center gap-8 md:flex-row md:items-start md:justify-center">
        <section className="prose prose-sm prose-neutral max-w-none flex-1 md:max-w-md md:py-2">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{about}</ReactMarkdown>
        </section>
        <LoginForm />
      </div>
    </main>
  );
}
