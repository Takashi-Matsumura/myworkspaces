<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## このプロジェクトのアーキテクチャ要点

myworkspaces は [opencode-demo](https://github.com/Takashi-Matsumura/opencode-demo) と [ptyserver-demo](https://github.com/Takashi-Matsumura/ptyserver-demo) を合成したもの:

- **ベース UI**: opencode-demo（Excalidraw ホワイトボード + フロートターミナル + ファイルツリー）
- **実行環境**: ptyserver-demo（dockerode でユーザー用 Docker コンテナを管理、bash アタッチ）
- 3 種のターミナル: **Coding** (opencode) / **Business** (opencode + 裏面で Excel/設定) / **Bash** (素の Ubuntu bash)
- ユーザーごとに 1 つのコンテナ `myworkspaces-shell-{sub}`（イメージ `myworkspaces-sandbox:latest`）を永続維持。`/root` は named volume `myworkspaces-home-{sub}`
- ワークスペースは `/root/workspaces/{id}/` 固定。複数作成・切替可能
- 認証は将来置き換える前提で、現状は sub="demo" 固定（`lib/user.ts` の `getSub()` を書き換えると OIDC に差し替えやすい）
- Next.js と WebSocket を **同一プロセス** (`server.ts`) に相乗りし、`/ws/pty` でターミナルを中継

## ファイル構成の概略

```
server.ts                    # Next.js + WS (/ws/pty) を相乗りする custom server
lib/
  user.ts                    # sub の解決 (現状 demo 固定)
  ws-protocol.ts             # WebSocket メッセージ型
  docker-session.ts          # image / volume / container / exec セッションの ensure
  user-store.ts              # ~/.myworkspaces/users/{sub}.json のワークスペースメタ
  workspace.ts               # コンテナ内の ls / cat / mkdir / rm / putArchive
docker/sandbox/
  Dockerfile                 # ubuntu:24.04 + Node.js + opencode CLI + vim/git/curl 等
  templates/                 # 新規ワークスペース初期化時にコピーする雛形
app/
  page.tsx                   # 3 ターミナル + ワークスペースパネル + フッター
  demo/components/           # UI コンポーネント群 (whiteboard / floating-* / xterm-view)
  api/
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

## Git 運用ルール

このリポジトリではグローバルの `~/.claude/CLAUDE.md` の「main への直 push 禁止」ルールを踏襲する。実装フェーズに入る前に feature ブランチを切ること。
