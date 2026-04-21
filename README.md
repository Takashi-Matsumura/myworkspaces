# myworkspaces

ブラウザ上のホワイトボードから、ユーザーごとに隔離された Docker サンドボックスへ入る Next.js アプリ。各ユーザーのコンテナには OpenCode CLI と Ubuntu の bash が両方入っていて、フロートするターミナルから **Coding (opencode)** / **Business (opencode)** / **Bash (素の Ubuntu)** の 3 種類を使い分けられる。

`opencode-demo` の UI (Excalidraw + フロートパネル) と `ptyserver-demo` の Docker サンドボックス運用 (ユーザー単位の永続コンテナ + named volume) を合成したもの。

## 構成

```
Browser
  ├─ Excalidraw (full-screen whiteboard)
  ├─ FloatingWorkspace (create / switch workspaces, file tree, DnD upload)
  └─ FloatingTerminal × 3 (coding / business / ubuntu)
         │ ws://localhost:3000/ws/pty?cwd=/root/workspaces/{id}&cmd=opencode|shell
         ▼
  Next.js 16 custom server (server.ts)
         │ dockerode
         ▼
  Docker
    └─ container: myworkspaces-shell-{sub}
         ├─ image: myworkspaces-sandbox:latest  (ubuntu:24.04 + opencode + Node.js + vim/git/curl)
         └─ mount: myworkspaces-home-{sub} → /root    (named volume, per-user persistent)
```

ユーザー (`sub`) ごとに **独立したコンテナ** と **独立した named volume** を持つ。コンテナ内 `/root/workspaces/{id}/` がワークスペースで、UI から複数作成・切替できる。

## 必要なもの

- Node.js 22 以上
- Docker Desktop（または同等の Docker 環境）
- ホスト側で `llama-server` を :8080 で動かしておくと opencode から使える（任意）

## セットアップ

```bash
npm install
npm run dev
```

初回起動時に `myworkspaces-sandbox:latest` イメージが自動ビルドされる（1〜2 分）。以降は skip される。

ブラウザで http://localhost:3000 を開くと、ホワイトボード上に Workspace パネルが出る。「新規」でワークスペースを作成してから、Coding / Business / Bash のいずれかのボタンでターミナルを起動する。

## スクリプト

| コマンド | 動作 |
|---|---|
| `npm run dev` | `tsx watch server.ts` で Next.js + WebSocket を :3000 に起動 |
| `npm run build` | Next.js 本番ビルド |
| `npm run start` | production モードで `tsx server.ts` を起動 |
| `npm run lint` | ESLint |

## コンテナ・データの挙動

| 対象 | 切断・スリープ | 「コンテナ作り直し」 |
|---|---|---|
| `/root/workspaces/**` (ワークスペース実体、dotfiles 含む) | ✅ 残る | ✅ 残る（named volume） |
| 自前イメージに焼き込んだ opencode / vim / git | ✅ 残る | ✅ 残る（image） |
| 自分で `apt install` したもの | ✅ 残る | ❌ 消える |
| `/tmp` 等、`/root` 以外 | ✅ 残る（コンテナ再起動までは） | ❌ 消える |

フッター左の 🔄 アイコンで **コンテナを作り直す**（`/root` 以外のリセット）。named volume は温存される。

## API

| method | path | body / query | 用途 |
|---|---|---|---|
| `GET` | `/api/user/workspaces` | — | 自 sub のワークスペース一覧 |
| `POST` | `/api/user/workspaces` | `{label}` or `{id,label}` | 作成 / rename |
| `PATCH` | `/api/user/workspaces` | `{id}` | lastOpenedAt 更新 |
| `DELETE` | `/api/user/workspaces?id=` | — | 削除（実体 + メタ） |
| `GET` | `/api/workspace?path=` | — | ディレクトリ 1 階層列挙 |
| `GET` | `/api/workspace/file?path=` | — | ファイル内容 (先頭 512KB) |
| `POST` | `/api/workspace/upload` | multipart (`targetDir`, `relativePath`, `file`) | アップロード (tar → putArchive) |
| `GET` | `/api/container` | — | コンテナ状態 |
| `DELETE` | `/api/container` | — | コンテナ作り直し |

WebSocket: `GET /ws/pty?cwd=<path>&cmd=opencode|shell&sessionId=<optional>` — attachSession。切断から 5 分以内は `sessionId` 再送で再接続可。

## 認証について

現状は単一ユーザー `sub="demo"` 固定。`lib/user.ts` の `getSub(req)` を書き換えれば、OIDC / Cookie / ヘッダ等に差し替えられる。呼び出し側は server / API route の 1 点を除きこの関数だけに依存しているので、影響範囲は限定的。

## 既知の制約

- 初回イメージビルドで opencode CLI を `curl | bash` でダウンロードする都合、外部ネットワークが必要
- named volume はホストからは `docker volume inspect myworkspaces-home-{sub}` の mount point 経由でしか見えない
- OpenCode の設定パネルと Business variant の Excel プレビューは移植途中（後続タスク）

## ライセンス

MIT License — Copyright (c) 2026 Takashi Matsumura
