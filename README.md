# myworkspaces

ブラウザのホワイトボードから、ユーザーごとに隔離された Docker サンドボックスに入れる Next.js アプリ。
各ユーザーのコンテナには [OpenCode](https://opencode.ai/) CLI と Ubuntu の bash が入っていて、ホワイトボード上にフロートするターミナルパネルから **Coding (opencode)** / **Business (opencode)** / **Bash (素の Ubuntu)** の 3 種類を使い分けられる。

> ⚠️ **これは開発・検証用のデモ実装です。**
> 認証は `sub="demo"` 固定で、ホストの Docker socket を使います。そのままインターネットに公開しないでください（詳細は「セキュリティ注意」セクション）。

## 特徴

- 🖼️ **Excalidraw の無限ホワイトボード** を背景に、必要なパネルをフロートで開く UI
- 🐳 **ユーザーごとに 1 つのコンテナ** (`myworkspaces-shell-{sub}`) を永続起動し、`/root` は named volume で保持
- 📂 **1 コンテナに複数ワークスペース** (`/root/workspaces/{id}`) — Workspace パネルから作成・切替・リネーム・削除
- 💻 **3 種類のターミナルパネル**
  - **Coding** — `opencode` を起動した対話シェル（コード支援向け）
  - **Business** — `opencode` を別プロファイルで起動（業務・文書向け、裏面で Excel 等）
  - **Bash** — 素の Ubuntu bash
- 🖱️ **ファイルツリー + ドラッグ&ドロップアップロード**（tar → `putArchive` でコンテナに転送）
- 🔄 **コンテナ作り直しボタン**（`/root` は温存、それ以外を初期化）
- 🔌 **Next.js と WebSocket が同一プロセス** (`server.ts`) — PTY 中継は `/ws/pty`

## アーキテクチャ

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
- Docker Desktop（または同等の Docker 環境、ホスト側の `/var/run/docker.sock` を使う）
- （任意）ホスト側で `llama-server` を `:8080` で動かすと opencode から利用可（`host.docker.internal` 経由）

## セットアップ

```bash
git clone https://github.com/Takashi-Matsumura/myworkspaces.git
cd myworkspaces
npm install
npm run dev
```

初回起動時に `myworkspaces-sandbox:latest` イメージが自動ビルドされる（1〜2 分、opencode CLI を `curl | bash` で取得するため外部ネットワークが必要）。以降は skip される。

ブラウザで http://localhost:3000 を開くと、ホワイトボード上に Workspace パネルが出る。「新規」でワークスペースを作成してから、Coding / Business / Bash のいずれかのボタンでターミナルパネルを起動する。

## スクリプト

| コマンド | 動作 |
|---|---|
| `npm run dev` | `tsx watch server.ts` で Next.js + WebSocket を :3000 に起動 |
| `npm run build` | Next.js 本番ビルド |
| `npm run start` | production モードで `tsx server.ts` を起動 |
| `npm run lint` | ESLint |

## 使い方

1. **ワークスペースを作る** — Workspace パネルで「新規」をクリック。`/root/workspaces/{id}` が作られ、雛形（`docker/sandbox/templates/`）がコピーされる。
2. **ターミナルパネルを開く** — Coding / Business / Bash のいずれか。パネルが開き、選択中のワークスペースを `cwd` にしてコンテナ内で PTY が起動する。
3. **ファイルを編集** — ファイルツリーからクリックで開き、ローカル GUI エディタや opencode から編集。DnD でアップロードも可能。
4. **コンテナをリセット** — フッター左の 🔄 アイコンで「コンテナ作り直し」。`/root` 以外を初期化する（`apt install` したものは消えるが、ワークスペースと雛形は残る）。

## コンテナ・データの挙動

| 対象 | 切断・スリープ | 「コンテナ作り直し」 |
|---|---|---|
| `/root/workspaces/**` (ワークスペース実体、dotfiles 含む) | ✅ 残る | ✅ 残る（named volume） |
| 自前イメージに焼き込んだ opencode / vim / git | ✅ 残る | ✅ 残る（image） |
| 自分で `apt install` したもの | ✅ 残る | ❌ 消える |
| `/tmp` 等、`/root` 以外 | ✅ 残る（コンテナ再起動までは） | ❌ 消える |

## API

| method | path | body / query | 用途 |
|---|---|---|---|
| `GET` | `/api/user/workspaces` | — | 自 sub のワークスペース一覧 |
| `POST` | `/api/user/workspaces` | `{label}` or `{id,label}` | 作成 / rename |
| `PATCH` | `/api/user/workspaces` | `{id}` | lastOpenedAt 更新 |
| `DELETE` | `/api/user/workspaces?id=` | — | 削除（実体 + メタ） |
| `GET` | `/api/workspace?path=` | — | ディレクトリ 1 階層列挙 |
| `GET` | `/api/workspace/file?path=` | — | ファイル内容（先頭 512KB） |
| `POST` | `/api/workspace/upload` | multipart (`targetDir`, `relativePath`, `file`) | アップロード (tar → putArchive) |
| `GET` | `/api/container` | — | コンテナ状態 |
| `DELETE` | `/api/container` | — | コンテナ作り直し |

WebSocket: `GET /ws/pty?cwd=<path>&cmd=opencode|shell&sessionId=<optional>` — attachSession。切断から 5 分以内は `sessionId` 再送で再接続可。

## 認証の拡張ポイント

現状は単一ユーザー `sub="demo"` 固定。`lib/user.ts` の `getSub(req)` を書き換えれば、OIDC / Cookie / ヘッダ等に差し替えられる。呼び出し側は server / API route の 1 点を除きこの関数だけに依存しているので、影響範囲は限定的。

## セキュリティ注意

このリポジトリは **ローカル開発・検証用** を想定している。そのままインターネットに公開するのは危険。

- **ホストの Docker socket を使う** — サーバプロセスがコンテナを自由に起動・削除できる。つまりサーバが乗っ取られるとホストまで抜ける可能性がある。
- **認証が未実装** — 全員が同じ `sub="demo"` を共有する。複数ユーザーに出すなら最低でも `lib/user.ts` の `getSub()` を OIDC 等に差し替えること。
- **コンテナ capability を一部残している** — `apt install` を通すため `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `FSETID`, `SETGID`, `SETUID` を付与している（`ALL` は落としている）。
- **アップロードサイズ・コマンド実行に制限を入れていない** — 悪意あるユーザーはコンテナを食いつぶせる。リソース制限は `docker-session.ts` で追加可能。

## 既知の制約

- 初回イメージビルドで opencode CLI を `curl | bash` でダウンロードする都合、外部ネットワークが必要
- named volume はホストからは `docker volume inspect myworkspaces-home-{sub}` の mount point 経由でしか見えない
- OpenCode の設定パネルと Business variant の Excel プレビューは移植途中（後続タスク）

## 謝辞

- [opencode-demo](https://github.com/Takashi-Matsumura/opencode-demo) — Excalidraw ホワイトボード + フロートパネル + ファイルツリーの UI 部分
- [ptyserver-demo](https://github.com/Takashi-Matsumura/ptyserver-demo) — dockerode でユーザー専用コンテナを管理し、bash にアタッチする仕組み
- [OpenCode](https://opencode.ai/) — コンテナに焼き込んでいる CLI
- [Excalidraw](https://github.com/excalidraw/excalidraw), [xterm.js](https://xtermjs.org/)

## ライセンス

MIT License — Copyright (c) 2026 Takashi Matsumura
