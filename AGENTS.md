<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## このプロジェクトのアーキテクチャ要点

myworkspaces は [opencode-demo](https://github.com/Takashi-Matsumura/opencode-demo) と [ptyserver-demo](https://github.com/Takashi-Matsumura/ptyserver-demo) を合成したもの:

- **ベース UI**: opencode-demo（Excalidraw ホワイトボード + フロートパネル + ファイルツリー）
- **実行環境**: ptyserver-demo（dockerode でユーザー用 Docker コンテナを管理、bash アタッチ）
- UI 用語は **「パネル」** で統一: ホワイトボード上にフロートする矩形領域（Workspace / Coding / Business / Bash の各パネル）。「ウィンドウ」とは呼ばない。
- 3 種のターミナルパネル: **Coding** (opencode) / **Business** (opencode + 裏面で Excel/設定) / **Bash** (素の Ubuntu bash)
- ユーザーごとに 1 つのコンテナ `myworkspaces-shell-{sub}`（イメージ `myworkspaces-sandbox:latest`）を永続維持。`/root` は named volume `myworkspaces-home-{sub}`。`sub` は DB 上の `User.id` (cuid)
- ワークスペースは `/root/workspaces/{id}/` 固定。複数作成・切替可能
- **認証**: アカウント／パスワード方式。`/login` で登録・ログイン。セッションは PostgreSQL (`Session` テーブル) で管理し、署名付き HttpOnly Cookie `mw_session` で保持。`lib/user.ts` の `getUser(req)` が Cookie → `User` を解決する唯一の窓口 (OIDC 移行時はここを差し替える)
- **データベース**: PostgreSQL 16 (docker-compose)。Prisma 7 をアダプタ (`@prisma/adapter-pg`) 経由で使用
- Next.js と WebSocket を **同一プロセス** (`server.ts`) に相乗りし、`/ws/pty` でターミナルを中継。WS も Cookie 認証済み

## ファイル構成の概略

```
server.ts                    # Next.js + WS (/ws/pty) を相乗りする custom server
proxy.ts                     # Next.js 16 proxy (旧 middleware)。Cookie 有無で /login へガード
prisma/
  schema.prisma              # User / Session / Workspace のスキーマ
  migrations/                # prisma migrate dev の履歴
prisma.config.ts             # Prisma 7 の設定 (datasource + schema path)
docker-compose.yml           # 開発用 PostgreSQL (postgres:16, :5432)
lib/
  auth.ts                    # Cookie 発行・検証、bcrypt ハッシュ
  prisma.ts                  # PrismaClient (アダプタ経由)
  user.ts                    # getUser(req) が Cookie → SessionUser を解決
  ws-protocol.ts             # WebSocket メッセージ型
  docker-session.ts          # image / volume / container / exec セッションの ensure
  user-store.ts              # Workspace CRUD (Prisma)
  workspace.ts               # コンテナ内の ls / cat / mkdir / rm / putArchive
docker/sandbox/
  Dockerfile                 # ubuntu:24.04 + Node.js + opencode CLI + vim/git/curl 等
  templates/                 # 新規ワークスペース初期化時にコピーする雛形
app/
  page.tsx                   # 4 パネル (Workspace + Coding/Business/Bash) + フッター
  login/page.tsx             # ログイン / 新規登録の 2-tab フォーム
  demo/components/           # UI コンポーネント群 (whiteboard / floating-* / xterm-view / account-badge)
  api/
    auth/                    # register / login / logout / me
    user/workspaces/         # ワークスペース CRUD
    workspace/               # ディレクトリ列挙
    workspace/file/          # ファイル取得
    workspace/upload/        # DnD アップロード (tar → putArchive)
    container/               # コンテナ状態取得 / リセット
```

## 既知の決定事項

- `reactStrictMode: false` は Excalidraw 0.18 + React 19 の都合
- `ExtraHosts: host.docker.internal:host-gateway` を付け、Linux でもコンテナからホストの llama-server に到達可能
- cap は `ALL` 落とし → `CHOWN DAC_OVERRIDE FOWNER FSETID SETGID SETUID` だけ戻す。apt が内部で uid 降格する最低限
- exec.start は必ず `Tty: true` を渡す（でないと multiplex ストリームになり出力が壊れる）
- WS プロトコル: クライアント → サーバは JSON テキスト、サーバ → クライアントは PTY 生出力 binary + 制御 JSON
- Next.js 16 では `middleware.ts` は deprecated。`proxy.ts` を使う
- Prisma 7 は schema.prisma に `url = env("DATABASE_URL")` を書けない。`prisma.config.ts` の `datasource.url` と、`PrismaClient` に渡す `adapter` に分離する
- `middleware`/`proxy` は Edge Runtime なので `node:crypto` を間接 import しない (Cookie 名だけ持つ）
- `server.ts` と `lib/prisma.ts` の先頭で `import "dotenv/config"`。Next.js 16 の custom server 文脈では `.env` が自動ロードされない

## Git 運用ルール

このリポジトリではグローバルの `~/.claude/CLAUDE.md` の「main への直 push 禁止」ルールを踏襲する。実装フェーズに入る前に feature ブランチを切ること。
