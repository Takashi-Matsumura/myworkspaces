import fs from "node:fs";
import path from "node:path";
import LoginShell from "./login-shell";

// ログイン画面の左側に表示するアプリ説明文 (Markdown)。文章の更新は
// `app/login/about.md` だけ編集すれば良いように分離してある。
// Server Component として fs から同期読み込み → Client の LoginShell に渡す。
function loadAbout(): string {
  return fs.readFileSync(path.join(process.cwd(), "app/login/about.md"), "utf-8");
}

export default function LoginPage() {
  return <LoginShell about={loadAbout()} />;
}
