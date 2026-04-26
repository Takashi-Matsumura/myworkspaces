# myworkspaces

ブラウザのホワイトボードから、ユーザーごとに隔離された Docker サンドボックスに入れる Next.js アプリ。
各ユーザーのコンテナには [OpenCode](https://opencode.ai/) CLI と Ubuntu の bash が入っていて、ホワイトボード上にフロートするチャット/ターミナルパネルから **Code (opencode)** / **Analyze (opencode)** / **Biz (opencode)** / **Bash (素の Ubuntu)** の 4 種類を使い分けられる。

Biz パネルはマルチモーダル分析 (CSV/XLSX/PDF/画像) と DeepSearch (Tavily 等のプロバイダで Web 検索 → 引用付きレポート生成) に対応した業務向け UI。Analyze パネルは既存ソースの構造把握・詳細分析・移植ガイド生成に特化したフェーズ式 UI。

> ⚠️ **これは開発・検証用のデモ実装です。**
> 認証はアカウント／パスワード方式（Phase 2）、パスワードは bcrypt でハッシュ化して PostgreSQL に保存。ホストの Docker socket を使うため、そのままインターネットに公開しないでください（詳細は「セキュリティ注意」セクション）。

## 特徴

- 🔐 **アカウント／パスワード認証** — `/login` から登録・ログイン。ユーザーごとにコンテナ・ワークスペース・設定・**ホワイトボード**が完全分離
- 🔒 **ネットワーク隔離トグル** — ユーザー単位で「外部インターネット遮断」を ON/OFF。隔離 ON でもホスト上の llama-server (`host.docker.internal:8080`) への到達は保つので、ローカル LLM を使ったサンドボックス業務が可能（詳細は「ネットワーク隔離」セクション）
- 🖊️ **ホワイトボード自動保存** — Excalidraw の描画を 1.5 秒デバウンスで DB に保存、次回ログイン時に復元
- 🖼️ **Excalidraw の無限ホワイトボード** を背景に、必要なパネルをフロートで開く UI
- 🐳 **ユーザーごとに 1 つのコンテナ** (`myworkspaces-shell-{User.id}`) を永続起動し、`/root` は named volume で保持
- 📚 **ユーザーごとに RAG サイドカー** (`myworkspaces-rag-{User.id}`) — Qdrant + FastAPI 同居コンテナで、Web UI の RAG パネルから取り込んだ .txt/.md/.pdf/.html を自分専用ベクトル DB に保存。Coding / Business パネルの opencode からは透過的に参照される（詳細は「RAG」セクション）
- 📂 **1 コンテナに複数ワークスペース** (`/root/workspaces/{id}`) — Workspace パネルから作成・切替・リネーム・削除（前回開いたものは起動時に自動で開く）
- 💻 **4 種類のパネル**
  - **Code** — `opencode` のコード支援向けチャット UI (plan / build エージェント切替、ProgressPane、コード生成ルール `coding-rules.md` 自動注入)
  - **Analyze** — 既存ソースを **survey / detail / port** の 3 フェーズで分析する専用 UI。`docs/analysis/` 配下に概観・モジュール・API・データモデル・移植ガイドを生成 (`analyze-rules.md` 自動注入)
  - **Biz** — マルチモーダル分析 + DeepSearch の業務向け UI。**Data / Doc / Web / Synthesize** の 4 フェーズ + 5 個の組込テンプレ (KPI サマリ / PDF 要約 / 画像エビデンス / 競合スキャン / 三面統合レポート)。CSV/XLSX/PDF/画像を DnD で `inputs/` に投入、`web_search` tool で Web 一次情報を引用付き Markdown 化、`reports/` と `research/` に成果物を蓄積（詳細は「Biz パネル」セクション）
  - **Bash** — 素の Ubuntu bash（2 段プロンプト: cwd + git ブランチ）。`claude` コマンドで **Claude Code CLI** も起動可能（初回 `claude login` で OAuth 認証、トークンは named volume に永続保存）
- 🛠️ **opencode 標準スキル + 組込スキル** — Biz パネル初回起動時に `business-deep-search` / `business-report` / `business-data-eda` の 3 スキルを `~/.config/opencode/skills/` に冪等で seed。UI から自由に編集・追加可能
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
  ├─ FloatingTerminal × 1 (Bash: pty)
  └─ Coding/Analyze/Business Console × N (opencode サイドカー HTTP/SSE)
         │ ws://localhost:3000/ws/pty   (Bash パネルのみ)
         │ /api/opencode/sessions, /messages, /events  (SSE)
         │ /api/biz/internal/web-search  (opencode tool → ホスト中継 → Tavily)
         │ mw_session Cookie (signed + HttpOnly)
         ▼
  Next.js 16 custom server (server.ts)  ─── proxy.ts: /login ガード
         │
         ├─── Prisma 7 (adapter-pg) ────► PostgreSQL 16
         │                                 └─ container: myworkspaces-postgres
         │                                    └─ volume: myworkspaces-db
         │                                       ・User / Session / Workspace (メタ)
         │                                       ・Whiteboard (Excalidraw 保存)
         │                                       ・Settings / NetworkIsolation / RagDocument
         │
         └─── dockerode ──────────────────► Docker
                                            │
                                            ├─ container: myworkspaces-shell-{User.id}
                                            │  ├─ image: myworkspaces-sandbox:latest
                                            │  │  (ubuntu:24.04 + opencode + claude +
                                            │  │   Node.js + vim/git/curl +
                                            │  │   iputils-ping/dig/ip)
                                            │  ├─ volume: myworkspaces-home-{User.id} → /root
                                            │  └─ network: 隔離 OFF/ON は下記 egress-proxy 参照
                                            │
                                            ├─ container: myworkspaces-opencode-{User.id}
                                            │  ├─ 同イメージ (opencode serve --port 9091)
                                            │  ├─ named volume を shell コンテナと共有 (DB 共有)
                                            │  ├─ Env: BIZ_TOOL_TOKEN (Biz web_search 用)
                                            │  └─ Code/Analyze/Biz パネルが HTTP+SSE で接続
                                            │
                                            ├─ container: myworkspaces-rag-{User.id}
                                            │  └─ Qdrant + FastAPI (詳細は「RAG」)
                                            │
                                            └─ container: myworkspaces-egress-proxy (隔離 ON 時のみ)
                                               ├─ image: alpine/socat
                                               ├─ network: myworkspaces-isolated + bridge
                                               └─ socat: :8080/:8081 をホストに forward
```

ユーザー (`User.id` = cuid) ごとに **独立したコンテナ・named volume・ホワイトボード** を持つ。コンテナ内 `/root/workspaces/{id}/` がワークスペースで、UI から複数作成・切替できる。

Docker Desktop 上では、`myworkspaces-postgres` と各ユーザの `myworkspaces-shell-*` が **compose プロジェクトラベル** (`com.docker.compose.project=myworkspaces`) で同じグループに集約表示される。

## ネットワーク隔離

Settings → 「ネットワーク」タブのトグルで、ユーザーごとに「外部インターネットから遮断するが、ホスト上の llama-server への到達は保つ」モードを切り替えられる。切替時はコンテナが自動で再作成される（`/root` の named volume は保持されるので作業ファイルは失われない）。

### 要件

- **外部 (example.com 等) への到達は遮断**する
- **ホスト上の llama-server (`host.docker.internal:8080`) には到達できる**ことを維持
- コンテナ cap に `CAP_NET_ADMIN` を追加しない（`CapDrop=ALL` 方針を崩さない）

### 実装アーキテクチャ（サイドカープロキシ方式）

このリポジトリは **Mac Studio をホストに据えた構成を想定**している。Docker Desktop for Mac は Linux VM + vpnkit を挟むため、Linux ネイティブの Docker と iptables の効き方が違い、`enable_ip_masquerade=false` だけでは外部遮断が効かず、逆に `Internal: true` にすると host-gateway への到達も同時に切れる。そのため、「外部遮断」と「ホスト到達」を両立するには**サイドカープロキシを挟む**必要があった。

```
          ┌─────────────────────────────────────────┐
          │ user-defined bridge: myworkspaces-isolated
          │ Internal: true  ← Docker Desktop でも確実に外部遮断
          │                                         │
          │  ┌──────────────┐   ┌──────────────────┐│
          │  │ user shell   │──▶│ egress-proxy     ││
          │  │ (shell-{sub})│   │ 172.25.0.2:8080  ││
          │  │              │   │ (alpine/socat)   ││
          │  └──────────────┘   └──────┬───────────┘│
          └────────────────────────────┼────────────┘
                                       ▼
                             ┌────────────────────┐
                             │ default bridge     │
                             │ host-gateway →     │
                             │ host llama-server  │
                             │ :8080              │
                             └────────────────────┘
```

- ユーザーコンテナは `Internal: true` 隔離 bridge にのみ attach → **外部完全遮断**
- 共有サイドカー `myworkspaces-egress-proxy`（`alpine/socat`）が **isolated bridge と default bridge の両方に常駐** し、`:8080` のみをホストに forward
- ユーザーコンテナの `ExtraHosts` で `host.docker.internal` を プロキシ固定 IP (`172.25.0.2`) に解決 → `opencode.json` の endpoint は書き換え不要

### もし Linux サーバだったら

Linux ホスト（例: Ubuntu サーバ、Docker Desktop を使わない構成）であれば、プロキシサイドカーを立てずに **単一の user-defined bridge だけ**で要件を満たせる見込みがある:

- `docker network create --opt com.docker.network.bridge.enable_ip_masquerade=false myworkspaces-isolated`
  - NAT (MASQUERADE) を無効化 → 外向きパケットはホストで書き換えられず破棄される（≒ 外部到達不可）
  - bridge gateway (`host-gateway` が解決する IP) への L3 到達は維持されるので、ホスト llama-server には届く
- あるいは `DOCKER-USER` iptables chain をホスト側で操作し、許可リスト方式でフィルタ（ホスト root が使える環境限定）

上記はいずれも Linux カーネルの iptables / netfilter に直接依存する。Docker Desktop for Mac は Linux VM の外に vpnkit が挟まる都合でこれらが素直に効かないため、本リポジトリでは **mac / Linux どちらでも同じ挙動になる前提**でサイドカープロキシ方式を採用している。将来 Linux 専用運用に寄せる場合は `lib/docker-session.ts` の `ensureIsolatedNetwork()` / `ensureEgressProxyContainer()` を差し替える余地がある。

### サンドボックス側の補強

ネットワーク隔離の挙動を検証しやすくするため、コンテナイメージ（`docker/sandbox/Dockerfile`）に次を追加:

- `iputils-ping` / `iproute2` / `dnsutils`（`ping` / `ip` / `dig`）
- `HostConfig.CapAdd` に `NET_RAW`（`no-new-privileges + CapDrop=ALL` 下でも file capability に依存せず `ping` を動かすため）
- `HostConfig.Sysctls` に `net.ipv4.ping_group_range = 0 2147483647`（unprivileged DGRAM ICMP socket の許可。将来 Python 等からの ICMP 利用も想定）

## 必要なもの

- Node.js 22 以上
- Docker Desktop（または同等の Docker 環境、ホスト側の `/var/run/docker.sock` を使う）
- PostgreSQL 16（`docker-compose.yml` に同梱、`npm run db:up` で起動）
- （任意）ホスト側で `llama-server` を `:8080` で動かすと opencode から利用可（`host.docker.internal` 経由）
- （RAG を使う場合）ホスト側に **埋め込み用の llama-server も追加で `:8081` で起動** する必要あり。`scripts/start-llama-servers.sh` がサンプル。BGE-M3 等の GGUF モデルを別途用意する
- （Biz パネルで DeepSearch を使う場合）検索プロバイダの API キー (Tavily を推奨)。`.env` に `TAVILY_API_KEY` と `BIZ_TOOL_TOKEN` を設定する (詳細は「Biz パネル」セクション)

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

1. **ワークスペースを作る** — Workspace パネルで「新規」をクリック。`/root/workspaces/{id}` が作られ、雛形（`docker/sandbox/templates/` 内の `.opencode/rules/*` と `.opencode/tools/*`）がコピーされる（次回以降は一覧の先頭 = 前回開いた ws が自動でオープン）。
2. **パネルを開く** — フッターの **Code / Analyze / Biz / Shell** のいずれかをクリック。パネルが開き、選択中のワークスペースを `cwd` にしてコンテナ内で PTY (Bash) または opencode サイドカー HTTP/SSE (Code/Analyze/Biz) が起動する。
3. **ファイルを編集** — ファイルツリーからクリックで開き、ローカル GUI エディタや opencode から編集。DnD でアップロードも可能 (Biz パネルでは composer エリアに直接 DnD で `inputs/` 配下に投入)。
4. **コンテナをリセット** — Workspace パネル裏面の設定からコンテナ作り直し。`/root` 以外を初期化する（`apt install` したものは消えるが、ワークスペースと雛形は残る）。
5. **既存ワークスペースに最新の rules / tools を再配布** — 新しい rule / tool ファイルを追加した後は、Workspace パネルから「ルール同期」を実行 (`/api/user/workspaces/{id}/sync-rules`)。`.opencode/rules/` と `.opencode/tools/` を最新版で上書きし、`opencode.json` の `instructions` / `agent` も merge される。

## データはどこに保存されるか

| データ | 保存先 | 寿命 |
|---|---|---|
| ユーザ / セッション / ワークスペースメタ / **ホワイトボード** / **ネットワーク隔離フラグ** / **RAG ドキュメントメタ** | PostgreSQL (`myworkspaces-postgres` コンテナ → ホスト側 volume `myworkspaces-db`) | volume を消さない限り永続 |
| ワークスペース実体 (`/root/workspaces/{id}/`、dotfiles 含む) | ユーザの Ubuntu コンテナ → named volume `myworkspaces-home-{User.id}` | 「コンテナ作り直し」でも残る |
| **opencode のセッション履歴 / スキル** (`/root/.config/opencode/`、`~/.local/share/opencode/`) | shell コンテナと opencode サイドカーで named volume `myworkspaces-home-{User.id}` を共有 | コンテナ・サイドカー作り直しでも残る |
| **Biz レポート/調査の成果物** (`reports/`, `research/`) | ワークスペース内 (上の named volume 配下) | ワークスペース削除まで残る |
| RAG ベクトルインデックス (Qdrant storage) | RAG サイドカーコンテナ → named volume `myworkspaces-rag-data-{User.id}` | サイドカー削除では残る、volume 削除で失われる |
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
| `GET` | `/api/container` | — | コンテナ状態（`networkMode` / `isolated` 含む） |
| `DELETE` | `/api/container` | — | コンテナ作り直し |
| `GET` | `/api/user/network` | — | ネットワーク隔離状態 `{requested, effective, networkMode}` |
| `PATCH` | `/api/user/network` | `{isolated: boolean}` | 隔離 ON/OFF 切替（DB 永続化＋PTY セッション破棄＋コンテナ削除を一体化。同値なら `{noop: true}`） |
| `GET` | `/api/rag/documents` | — | 自ユーザーの RAG 取り込み済みドキュメント一覧 |
| `DELETE` | `/api/rag/documents?id=` | — | ドキュメントを Prisma と RAG サイドカー Qdrant から削除 |
| `POST` | `/api/rag/upload` | multipart (`file`) | ドキュメントを RAG サイドカーに ingest して Prisma にメタ登録 |
| `POST` | `/api/opencode/activate` | `{workspaceId}` | opencode サイドカーの cwd 切替 (= コンテナ再作成)。初回 activate 時に Biz スキルを seed |
| `GET / POST` | `/api/opencode/sessions` | (POST) `{title?}` | チャットセッション一覧 / 新規作成 |
| `POST` | `/api/opencode/sessions/{id}/prompt` | `{parts, variant, agent?, mode?}` | プロンプト送信。`variant: coding\|analyze\|business` 別の prefix を自動付与 |
| `GET` | `/api/opencode/events` | — | SSE: tool 実行・部分応答などのイベント |
| `GET / POST` | `/api/opencode/skills` | (POST) `{name, description, body}` | スキル一覧 / 新規作成 |
| `GET / DELETE` | `/api/opencode/skills/{name}` | — | スキル詳細 / 削除 |
| `POST` | `/api/biz/internal/web-search` | `{query, max_results}` または `{read_url}` | 内部 API。コンテナ tool が `X-Biz-Tool-Token` ヘッダで叩く |
| `POST` | `/api/biz/web-search` | 同上 | UI / curl 動作確認用 (Cookie 認証) |

WebSocket: `GET /ws/pty?cwd=<path>&cmd=opencode|shell&sessionId=<optional>` — attachSession (Bash パネル用)。Cookie 必須（未認証は `close(4401)`）。切断から 5 分以内は `sessionId` 再送で再接続可。Code/Analyze/Biz パネルは WebSocket ではなく opencode サイドカーの HTTP+SSE で通信する。

## RAG

ユーザーごとに独立した RAG バックエンドを持ち、Coding / Business パネルの LLM 応答にそのユーザー自身のドキュメントを根拠として注入する。

### アーキテクチャ

```
[Host (Mac Studio)]
  llama-server :8080  ── chat 用 (Gemma 4 E4B IT)       ← 既存
  llama-server :8081  ── embedding 用 (BGE-M3 等)       ← 新規、RAG が叩く

[per-user network: myworkspaces-user-{sub}]
  myworkspaces-shell-{sub} ── opencode が http://rag-sidecar:9090/v1 を叩く
  myworkspaces-rag-{sub}   ── Qdrant (127.0.0.1:6333) + FastAPI (:9090)
       └─ /data に named volume `myworkspaces-rag-data-{sub}` をマウント
       └─ チャット受信 → 最終 user message を embedding → Qdrant top-K →
          system message として注入 → ホスト chat llama-server に中継
```

- 各ユーザーに 1 つの RAG サイドカーコンテナが立ち上がり、ベクトルインデックスは named volume に永続化される。ユーザー間でデータは一切共有されない（物理分離）。
- opencode 側の `opencode.json` は `baseURL: http://rag-sidecar:9090/v1` を向いていて、RAG サイドカーが OpenAI 互換 proxy として動作する。ユーザー側は RAG の存在を意識せずに通常の chat ができる。
- ネットワーク隔離 ON のユーザーでは、RAG サイドカーも同ユーザーの per-user bridge に入り、加えて `myworkspaces-isolated` にも attach して egress-proxy 経由でホスト llama-server (`:8080` + `:8081`) に抜ける。

### セットアップ

1. **埋め込み用モデルを用意** — 例: `BAAI/bge-m3` の Q4_K_M GGUF 変換版をダウンロード。
2. **ホスト側で llama-server を 2 つ起動**

   ```bash
   # 例: ~/llama.cpp をビルド済みと仮定
   CHAT_MODEL=~/models/gemma-4-e4b-it-Q4_K_M.gguf \
   EMBED_MODEL=~/models/bge-m3-Q4_K_M.gguf \
     ./scripts/start-llama-servers.sh
   ```

   または手動で:

   ```bash
   llama-server -m gemma-4-e4b-it-Q4_K_M.gguf --host 0.0.0.0 --port 8080 --ctx-size 8192 --jinja &
   llama-server -m bge-m3-Q4_K_M.gguf         --host 0.0.0.0 --port 8081 --embedding --pooling mean &
   ```

3. **RAG サイドカーイメージのビルド** — `npm run dev` 初回起動時に `myworkspaces-rag:latest` が自動でビルドされる (数分)。手動ビルドしたい場合は:

   ```bash
   docker build -t myworkspaces-rag:latest docker/rag/
   ```

4. **Web UI の RAG パネル** — フッターの「RAG」ボタンでパネルを開き、ドラッグ&ドロップか「ファイルを追加」で `.txt / .md / .pdf / .html` を取り込む。取り込み済みドキュメントは一覧表示され、ゴミ箱アイコンで削除できる。

5. **Coding / Business で質問** — 普段通り opencode で質問すると、RAG が自動で top-4 チャンクを注入した上で llama-server に転送する。

### 新しいパネル

| パネル | 役割 |
|---|---|
| RAG | ユーザー自身の RAG インデックスへドキュメント取り込み・一覧・削除を行う。フッター右側の「RAG」ボタンでトグル |

### コンテナリソース（RAG サイドカー）

| 項目 | 値 | メモ |
|---|---|---|
| image | `myworkspaces-rag:latest` | `docker/rag/Dockerfile`、Qdrant 公式バイナリをマルチステージで同梱、Python 3.12 + FastAPI |
| network | `myworkspaces-user-{sub}`（+ 隔離 ON 時は `myworkspaces-isolated` も） | コンテナ名 alias `rag-sidecar` で opencode から解決 |
| volume | `myworkspaces-rag-data-{sub}` → `/data` | Qdrant storage と一時受けファイル |
| port | `9090/tcp` を `127.0.0.1:<random>` にバインド | Next.js から ingest を叩く用。opencode→rag はコンテナ内ネットワーク |
| memory | 1 GB | Qdrant は on-disk payload |

## Biz パネル: マルチモーダル分析 + DeepSearch

Biz パネルは「ビジネスシーンで CSV/XLSX/PDF/画像 + Web 一次情報を組み合わせ、引用付きの Markdown レポートを生成する」業務向けの opencode UI。Coding/Analyze と同じ opencode サイドカーを共有しつつ、UI 側で **フェーズ・テンプレ・スキル** が業務向けに最適化されている。

### フェーズと出力先

| フェーズ | 主に使う tool | 出力先 |
|---|---|---|
| **Data** | `read_excel`, `bash`(awk/grep) | `reports/data-<topic>.md` |
| **Doc** | `read_pdf`, `describe_image` | `reports/doc-<topic>.md` |
| **Web** | `web_search` | `research/<slug>.md` |
| **Synthesize** | `read` (上 3 フェーズの成果物) + `write` | `reports/<topic>-summary.md` |

各フェーズに切り替えると、プロンプト先頭に対応する rules が自動付与される (`business-rules.md` 参照)。実装ファイル (`.ts/.tsx/.py/.go` 等) を `write/edit` で書き換えることは全フェーズで禁止。

### 組込テンプレ (5 種類)

composer 上のボタンで挿入:

- **KPI サマリ** (Data) — `@inputs/sales.xlsx` 月次集計 + 表 + Mermaid pie
- **PDF 要約** (Doc) — `@inputs/*.pdf` 3 段落要約 + 重要数字 + (page) 引用
- **画像エビデンス** (Doc) — `@inputs/*.png|jpg` を `describe_image` で「写っているもの / 文脈 / 注意点」
- **競合スキャン** (Web) — Web フェーズで多段検索 → 引用付き Markdown
- **三面統合レポート** (Synthesize) — Data + Doc + Web を統合して 5 章のレポート

### ファイル DnD アップロード

composer に CSV/XLSX/PDF/画像をドラッグ&ドロップすると、`/root/workspaces/{wid}/inputs/<name>` に配置され、composer に `@inputs/<name>` が自動挿入される。複数ファイルの同時アップロードも可能。

### 組込スキル (Phase C で seed)

Biz パネル初回起動時に `~/.config/opencode/skills/` に 3 スキルが冪等で seed される。ユーザーが UI で編集した内容は上書きされない。

| スキル | フェーズ | 役割 |
|---|---|---|
| `business-deep-search` | Web | 問いを 3-5 サブクエリに分解 → `web_search` 多段 → `research/<slug>.md` に引用付き |
| `business-report` | Synthesize | `reports/` + `research/` を統合 → `reports/<topic>-summary.md` 三面ビュー |
| `business-data-eda` | Data | `read_excel` で探索的データ分析 → `reports/data-eda-<topic>.md` |

スキルは Skills モーダル (`/api/opencode/skills`) からブラウザ上で編集・追加・削除も可能。

### DeepSearch (web_search tool)

Biz パネルからインターネットの一次情報を引用付きで取り込む機能。コンテナ内 opencode tool → ホスト Next.js 内部 API → 検索プロバイダの 3 段経路で動き、検索 API キーをコンテナへ漏らさず `.env` 一箇所で管理する。

```
[opencode サイドカー]                  [ホスト Next.js]                 [外部]
  web_search.ts (plugin)
       │ X-Biz-Tool-Token ヘッダ
       ▼
  http://host.docker.internal:3000/api/biz/internal/web-search
                                          │
                                          ▼
                                      lib/biz/search-provider.ts
                                          │
                                          ├─ tavily   ──► api.tavily.com (search/extract)
                                          ├─ brave    ──► api.search.brave.com
                                          └─ serper   ──► google.serper.dev
                                          + 本文取得フォールバック (jina-reader: r.jina.ai)
```

検索プロバイダは `BIZ_SEARCH_PROVIDER` env で切替 (`tavily` | `brave` | `serper`)。Brave/Serper は本文取得 API を持たないので、`read_url` 引数が来た時は JinaReader (`r.jina.ai`) にフォールバックする (`BIZ_READER_PROVIDER=jina` がデフォルト、`none` で無効化可)。

#### 規律 (business-rules.md)

- 1 ターンで `web_search` を呼ぶのは **最大 5 回**、うち `read_url` で本文取得は **最大 2 件**
- 引用は **3 件以上必須**。集まらなければ「未確認」と明示
- 一次情報 (公式 / プレス / 公的統計 / arXiv) を優先

### セットアップ (DeepSearch を使う場合)

```bash
# .env に以下を追加
BIZ_SEARCH_PROVIDER=tavily
TAVILY_API_KEY="<https://app.tavily.com/ で発行>"
BIZ_TOOL_TOKEN="$(openssl rand -hex 32)"  # コンテナ→ホスト内部 API の共有トークン
```

設定後 Next.js を再起動し、サイドカーを作り直す:

```bash
docker rm -f myworkspaces-opencode-<sub>
# 次の Biz パネル起動時に新 env 付きで再生成される
```

検証 (内部 API への curl):

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -H "X-Biz-Tool-Token: <BIZ_TOOL_TOKEN の値>" \
  http://localhost:3000/api/biz/internal/web-search \
  -d '{"query":"hello"}' | head -c 300
# {"provider":"tavily","hits":[{"title":"Hello - Wikipedia","url":"...
```

## 認証の拡張ポイント

Phase 2 で導入した認証はアカウント／パスワード方式。OIDC 等に差し替えるには `lib/user.ts` の `getUser(req)` 1 点を書き換えれば、呼び出し側 (API route / server.ts / proxy.ts) はそのまま使える。DB には `User` / `Session` / `Workspace` / `Whiteboard` のスキーマが入っているので、外部 ID プロバイダと `User.username` を紐付けるだけで移行可能。

## セキュリティ注意

このリポジトリは **ローカル開発・検証用** を想定している。そのままインターネットに公開するのは危険。

- **ホストの Docker socket を使う** — サーバプロセスがコンテナを自由に起動・削除できる。つまりサーバが乗っ取られるとホストまで抜ける可能性がある。
- **認証は最小限** — Cookie セッション + bcrypt パスワード。本番では `SESSION_SECRET` を必ず長いランダム文字列に変えること。強度要求・レートリミット・メール認証等は未実装。
- **コンテナ capability を一部残している** — `apt install` を通すため `CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `FSETID`, `SETGID`, `SETUID`、加えて `ping` 用に `NET_RAW` を付与している（`ALL` は落としている）。
- **ネットワーク隔離はオプトイン** — 既定は「隔離 OFF」で外部インターネットに自由に抜けられる。外部からのデータ取得やパッケージインストールを防ぎたい場合は Settings → ネットワークタブで ON にする（「ネットワーク隔離」セクション参照）。
- **アップロードサイズ・コマンド実行に制限を入れていない** — 悪意あるユーザーはコンテナを食いつぶせる。リソース制限は `docker-session.ts` で追加可能。

## 既知の制約

- 初回イメージビルドで opencode CLI を `curl | bash` でダウンロードする都合、外部ネットワークが必要
- named volume はホストからは `docker volume inspect myworkspaces-home-{User.id}` の mount point 経由でしか見えない
- ホワイトボードの画像添付 (Excalidraw `files`) は未対応。テキスト / 図形 / 矢印などの `elements` のみ保存
- ホワイトボードの `elements` は削除要素も含めて保存するので、長期運用で肥大化する可能性あり (将来的に圧縮 / GC を検討)
- 隔離 ON のときホストへ透過させるのは **`:8080` (chat) と `:8081` (embedding) のみ**。別ポートのローカルサービスを使いたい場合は `lib/docker-session.ts` の `PROXY_FORWARD_PORTS` を拡張する必要がある
- 隔離 ON では **Claude Code CLI (`claude`) を含むホスト外 API (`api.anthropic.com` 等) を必要とするツールは使えない**。Claude Code を使うときは隔離 OFF に戻す
- 同一ユーザが複数タブで開いている状態で隔離を切り替えると、別タブで開いている PTY セッションも一緒に閉じる（「別セッションで切替が起きました」通知は未実装）
- Biz パネルの DeepSearch は **小型 LLM (Gemma 4 e4b 等) では `web_search` tool を 1 回しか呼べないことが多い**。スキル `business-deep-search` は 3-5 サブクエリの多段検索を意図しているが、モデルのサイズによって 1 回で打ち切られる場合がある (より安定した動作には次期 Phase D での few-shot 改善を予定)
- 新しい opencode tool / rule を追加した時は **`myworkspaces-sandbox:latest` イメージの再ビルドが必要**。`docker rmi myworkspaces-sandbox:latest` 後にサイドカー再生成すると最新が取り込まれる

## 謝辞

- [opencode-demo](https://github.com/Takashi-Matsumura/opencode-demo) — Excalidraw ホワイトボード + フロートパネル + ファイルツリーの UI 部分
- [ptyserver-demo](https://github.com/Takashi-Matsumura/ptyserver-demo) — dockerode でユーザー専用コンテナを管理し、bash にアタッチする仕組み
- [OpenCode](https://opencode.ai/) — コンテナに焼き込んでいる CLI
- [Excalidraw](https://github.com/excalidraw/excalidraw), [xterm.js](https://xtermjs.org/)

## ライセンス

MIT License — Copyright (c) 2026 Takashi Matsumura
