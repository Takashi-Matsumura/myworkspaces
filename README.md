# myworkspaces

ブラウザのホワイトボードから、ユーザーごとに隔離された Docker サンドボックスに入れる Next.js アプリ。
各ユーザーのコンテナには [OpenCode](https://opencode.ai/) CLI と Ubuntu の bash が入っていて、ホワイトボード上にフロートするターミナルパネルから **Coding (opencode)** / **Business (opencode)** / **Bash (素の Ubuntu)** の 3 種類を使い分けられる。

> ⚠️ **これは開発・検証用のデモ実装です。**
> 認証はアカウント／パスワード方式（Phase 2）、パスワードは bcrypt でハッシュ化して PostgreSQL に保存。ホストの Docker socket を使うため、そのままインターネットに公開しないでください（詳細は「セキュリティ注意」セクション）。

## 特徴

- 🔐 **アカウント／パスワード認証** — `/login` から登録・ログイン。ユーザーごとにコンテナ・ワークスペース・設定・**ホワイトボード**が完全分離
- 🖊️ **ホワイトボード自動保存** — Excalidraw の描画を 1.5 秒デバウンスで DB に保存、次回ログイン時に復元
- 🖼️ **Excalidraw の無限ホワイトボード** を背景に、必要なパネルをフロートで開く UI
- 🐳 **ユーザーごとに 1 つのコンテナ** (`myworkspaces-shell-{User.id}`) を永続起動し、`/root` は named volume で保持
- 📂 **1 コンテナに複数ワークスペース** (`/root/workspaces/{id}`) — Workspace パネルから作成・切替・リネーム・削除（前回開いたものは起動時に自動で開く）
- 💻 **3 種類のターミナルパネル**
  - **Code** — `opencode` を起動した対話シェル（コード支援向け）
  - **Biz** — `opencode` を別プロファイルで起動（業務・文書向け、裏面で Excel 等）
  - **Bash** — 素の Ubuntu bash（2 段プロンプト: cwd + git ブランチ）
- 🖱️ **ファイルツリー + ドラッグ&ドロップアップロード**（tar → `putArchive` でコンテナに転送）
- 🔤 **各パネルのフォントサイズ変更**（A- / A+、localStorage に保存）
- 🎚️ **パネルの z-order 切替**（フッターのパネル名ボタンで最前面へ）
- 🔄 **コンテナ作り直しボタン**（`/root` は温存、それ以外を初期化）
- 🔌 **Next.js と WebSocket が同一プロセス** (`server.ts`) — PTY 中継は `/ws/pty`

## アーキテクチャ

```
Browser
  ├─ Excalidraw (full-screen whiteboard, auto-saved to DB)
  ├─ FloatingWorkspace (create / switch workspaces, file tree, DnD upload)
  └─ FloatingTerminal × 3 (coding / business / ubuntu)
         │ ws://localhost:3000/ws/pty?cwd=/root/workspaces/{id}&cmd=opencode|shell
         │ mw_session Cookie (signed + HttpOnly)
         ▼
  Next.js 16 custom server (server.ts)  ─── proxy.ts: /login ガード
         │
         ├─── Prisma 7 (adapter-pg) ────► PostgreSQL 16
         │                                 └─ container: myworkspaces-postgres
         │                                    └─ volume: myworkspaces-db
         │                                       ・User / Session
         │                                       ・Workspace (メタ)
         │                                       ・Whiteboard (Excalidraw 保存)
         │
         └─── dockerode ──────────────────► Docker
                                            └─ container: myworkspaces-shell-{User.id}
                                               ├─ image: myworkspaces-sandbox:latest
                                               │  (ubuntu:24.04 + opencode + Node.js + vim/git/curl)
                                               └─ volume: myworkspaces-home-{User.id} → /root
```

ユーザー (`User.id` = cuid) ごとに **独立したコンテナ・named volume・ホワイトボード** を持つ。コンテナ内 `/root/workspaces/{id}/` がワークスペースで、UI から複数作成・切替できる。

Docker Desktop 上では、`myworkspaces-postgres` と各ユーザの `myworkspaces-shell-*` が **compose プロジェクトラベル** (`com.docker.compose.project=myworkspaces`) で同じグループに集約表示される。

## 必要なもの

- Node.js 22 以上
- Docker Desktop（または同等の Docker 環境、ホスト側の `/var/run/docker.sock` を使う）
- PostgreSQL 16（`docker-compose.yml` に同梱、`npm run db:up` で起動）
- （任意）ホスト側で `llama-server` を `:8080` で動かすと opencode から利用可（`host.docker.internal` 経由）

## セットアップ

```bash
git clone https://github.com/Takashi-Matsumura/myworkspaces.git
cd myworkspaces
cp .env.example .env       # SESSION_SECRET を十分長い値に変える
npm install
npm run db:up              # PostgreSQL を docker-compose で起動
npm run db:migrate         # Prisma の初回マイグレーション
npm run db:seed-demo       # (任意) demo/demo ユーザを投入
npm run dev
```

初回起動時に `myworkspaces-sandbox:latest` イメージが自動ビルドされる（1〜2 分、opencode CLI を `curl | bash` で取得するため外部ネットワークが必要）。以降は skip される。

ブラウザで http://localhost:3000 を開くと `/login` にリダイレクトされる。「新規登録」タブからアカウントを作成するか、デモ用の `demo/demo` でログインする。ホワイトボード上に Workspace パネルが出たら「新規」でワークスペースを作成してから、Code / Biz / Bash のいずれかのボタンでターミナルパネルを起動する。

### デモ用アカウント

ログイン画面にクリック入力できるサンプルを表示している（`demo` ユーザは `db:seed-demo` で投入、`alice` / `bob` は任意で登録できる）。

| username | password | 備考 |
|---|---|---|
| `demo` | `demo` | `npm run db:seed-demo` で作成 |

## スクリプト

| コマンド | 動作 |
|---|---|
| `npm run dev` | `tsx watch server.ts` で Next.js + WebSocket を :3000 に起動 |
| `npm run build` | Next.js 本番ビルド |
| `npm run start` | production モードで `tsx server.ts` を起動 |
| `npm run lint` | ESLint |
| `npm run db:up` | PostgreSQL を docker-compose で起動 |
| `npm run db:down` | PostgreSQL を停止 |
| `npm run db:migrate` | `prisma migrate dev`（スキーマ変更後） |
| `npm run db:studio` | Prisma Studio を起動 |
| `npm run db:seed-demo` | `demo/demo` ユーザを投入 (既存なら更新) |

## 使い方

1. **ワークスペースを作る** — Workspace パネルで「新規」をクリック。`/root/workspaces/{id}` が作られ、雛形（`docker/sandbox/templates/`）がコピーされる（次回以降は一覧の先頭 = 前回開いた ws が自動でオープン）。
2. **ターミナルパネルを開く** — Code / Biz / Bash のいずれか。パネルが開き、選択中のワークスペースを `cwd` にしてコンテナ内で PTY が起動する。
3. **ファイルを編集** — ファイルツリーからクリックで開き、ローカル GUI エディタや opencode から編集。DnD でアップロードも可能。
4. **コンテナをリセット** — Workspace パネル裏面の設定からコンテナ作り直し。`/root` 以外を初期化する（`apt install` したものは消えるが、ワークスペースと雛形は残る）。

## データはどこに保存されるか

| データ | 保存先 | 寿命 |
|---|---|---|
| ユーザ / セッション / ワークスペースメタ / **ホワイトボード** | PostgreSQL (`myworkspaces-postgres` コンテナ → ホスト側 volume `myworkspaces-db`) | volume を消さない限り永続 |
| ワークスペース実体 (`/root/workspaces/{id}/`、dotfiles 含む) | ユーザの Ubuntu コンテナ → named volume `myworkspaces-home-{User.id}` | 「コンテナ作り直し」でも残る |
| 焼き込み済みツール (opencode / vim / git) | `myworkspaces-sandbox:latest` image 内 | image を消さない限り |
| 自分で `apt install` したもの | ユーザコンテナの書き込み層 | 「コンテナ作り直し」で消える |
| `/tmp` など `/root` 以外 | ユーザコンテナの書き込み層 | コンテナ停止までは残る、作り直しで消える |

### コンテナ・セッションのライフサイクル

| イベント | ユーザの Ubuntu コンテナ | `/root` (named volume) | ホワイトボード / DB |
|---|---|---|---|
| ログイン | `ensureContainer` で作成/起動 | 保持 | GET で復元 |
| 描画後 1.5 秒 (無操作) | — | — | PUT で自動保存 |
| ログアウト | `stop` (削除はしない) | 保持 | 保持 |
| 再ログイン | 既存コンテナを `start` | 保持 | 復元 |
| 「コンテナ作り直し」 | `remove` → 次回 `ensureContainer` で再作成 | 保持 | 保持 |
| `docker volume rm myworkspaces-db` | — | — | **全ユーザ分が失われる** |

## API

全ての API は Cookie 認証必須（未認証は 401）。

| method | path | body / query | 用途 |
|---|---|---|---|
| `POST` | `/api/auth/register` | `{username, password}` | 新規登録。成功時 Cookie `mw_session` を発行 |
| `POST` | `/api/auth/login` | `{username, password}` | ログイン |
| `POST` | `/api/auth/logout` | — | ログアウト（Cookie を破棄） |
| `GET` | `/api/auth/me` | — | 現在のユーザ（`{user: null}` で未ログイン） |
| `GET` | `/api/user/workspaces` | — | 自ユーザのワークスペース一覧 |
| `POST` | `/api/user/workspaces` | `{label}` or `{id,label}` | 作成 / rename |
| `PATCH` | `/api/user/workspaces` | `{id}` | lastOpenedAt 更新 |
| `DELETE` | `/api/user/workspaces?id=` | — | 削除（実体 + メタ） |
| `GET` | `/api/whiteboard` | — | ホワイトボード (Excalidraw elements + appState) |
| `PUT` | `/api/whiteboard` | `{elements, appState}` | ホワイトボードを upsert |
| `GET` | `/api/workspace?path=` | — | ディレクトリ 1 階層列挙 |
| `GET` | `/api/workspace/file?path=` | — | ファイル内容（先頭 512KB） |
| `POST` | `/api/workspace/upload` | multipart (`targetDir`, `relativePath`, `file`) | アップロード (tar → putArchive) |
| `GET` | `/api/container` | — | コンテナ状態 |
| `DELETE` | `/api/container` | — | コンテナ作り直し |

WebSocket: `GET /ws/pty?cwd=<path>&cmd=opencode|shell&sessionId=<optional>` — attachSession。Cookie 必須（未認証は `close(4401)`）。切断から 5 分以内は `sessionId` 再送で再接続可。

## 認証の拡張ポイント

Phase 2 で導入した認証はアカウント／パスワード方式。OIDC 等に差し替えるには `lib/user.ts` の `getUser(req)` 1 点を書き換えれば、呼び出し側 (API route / server.ts / proxy.ts) はそのまま使える。DB には `User` / `Session` / `Workspace` / `Whiteboard` のスキーマが入っているので、外部 ID プロバイダと `User.username` を紐付けるだけで移行可能。

## セキュリティ注意

このリポジトリは **ローカル開発・検証用** を想定している。そのままインターネットに公開するのは危険。

- **ホストの Docker socket を使う** — サーバプロセスがコンテナを自由に起動・削除できる。つまりサーバが乗っ取られるとホストまで抜ける可能性がある。
- **認証は最小限** — Cookie セッション + bcrypt パスワード。本番では `SESSION_SECRET` を必ず長いランダム文字列に変えること。強度要求・レートリミット・メール認証等は未実装。
- **コンテナ capability を一部残している** — `apt install` を通すため `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `FSETID`, `SETGID`, `SETUID` を付与している（`ALL` は落としている）。
- **アップロードサイズ・コマンド実行に制限を入れていない** — 悪意あるユーザーはコンテナを食いつぶせる。リソース制限は `docker-session.ts` で追加可能。

## 既知の制約

- 初回イメージビルドで opencode CLI を `curl | bash` でダウンロードする都合、外部ネットワークが必要
- named volume はホストからは `docker volume inspect myworkspaces-home-{User.id}` の mount point 経由でしか見えない
- ホワイトボードの画像添付 (Excalidraw `files`) は未対応。テキスト / 図形 / 矢印などの `elements` のみ保存
- ホワイトボードの `elements` は削除要素も含めて保存するので、長期運用で肥大化する可能性あり (将来的に圧縮 / GC を検討)

## 謝辞

- [opencode-demo](https://github.com/Takashi-Matsumura/opencode-demo) — Excalidraw ホワイトボード + フロートパネル + ファイルツリーの UI 部分
- [ptyserver-demo](https://github.com/Takashi-Matsumura/ptyserver-demo) — dockerode でユーザー専用コンテナを管理し、bash にアタッチする仕組み
- [OpenCode](https://opencode.ai/) — コンテナに焼き込んでいる CLI
- [Excalidraw](https://github.com/excalidraw/excalidraw), [xterm.js](https://xtermjs.org/)

## ライセンス

MIT License — Copyright (c) 2026 Takashi Matsumura
