FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# サンドボックス内で使う基本ツール一式。
# - 開発用: vim / nano / git / less / curl / procps
# - apt が `_apt` へ降格するのに必要: ca-certificates
# - Node.js ビルド (native addon) 用: build-essential / python3
# - opencode install スクリプト用: unzip
# - ネットワーク検証: iputils-ping (ping) / iproute2 (ip) / dnsutils (dig)
#   ネットワーク隔離機能の動作確認で ping / dig を使えるようにする。
#   ping は CapDrop=ALL でも net.ipv4.ping_group_range のおかげで DGRAM socket 経由で動作する。
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      jq \
      less \
      nano \
      procps \
      vim \
      unzip \
      build-essential \
      python3 \
      iputils-ping \
      iproute2 \
      dnsutils && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# ブラウザ内ターミナル (xterm.js) から bash に貼り付けたときに、
# readline が paste 全体を 1 ブロックとして扱えるよう bracketed paste を強制 ON。
# 既定で ON のはずだが、コンテナ内 bash で効かないケースがあるため明示する。
# /root/.inputrc は named volume 側で上書き消失するので /etc/inputrc に書く。
RUN { \
    echo 'set enable-bracketed-paste on'; \
    echo 'set editing-mode emacs'; \
    echo 'set blink-matching-paren on'; \
    echo '"\e[A": history-search-backward'; \
    echo '"\e[B": history-search-forward'; \
  } >> /etc/inputrc

# bash 起動時に readline 設定を読み直して bracketed paste を必ず適用する。
# (ログインシェルで inputrc が読まれないパスを補完するため)
RUN { \
    echo '# myworkspaces: force readline bracketed paste'; \
    echo 'bind "set enable-bracketed-paste on" 2>/dev/null || true'; \
  } >> /etc/bash.bashrc

# Bash パネル用の 2 段プロンプト。上段: cwd (+ git ブランチ) / 下段: '# '。
# /root は named volume なので /root/.bashrc に直書きしても既存ユーザーに
# 配布できない。さらに Ubuntu 既定の /root/.bashrc は末尾で PS1 を設定するため、
# 単に /etc/bash.bashrc で PS1 を export しても ~/.bashrc に負ける。
#
# → /etc/profile.d/ にスクリプトを置き、PROMPT_COMMAND フックで毎プロンプト
#   に PS1 を再設定する。bash -l (login shell) では /etc/profile から
#   /etc/profile.d/*.sh が読まれ、~/.bashrc 読み込み後もプロンプト描画前に
#   __myworkspaces_prompt が走って PS1 を上書きするので既存ユーザーにも効く。
#
# 注: dockerode の classic builder は RUN heredoc を展開しないため、
#     ファイルは別途用意して COPY する。
COPY myworkspaces-prompt.sh /etc/profile.d/myworkspaces-prompt.sh
RUN chmod 0644 /etc/profile.d/myworkspaces-prompt.sh

# Node.js 22 (NodeSource binary)。opencode と read_excel.ts が依存する。
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# opencode CLI。公式 installer は /root/.opencode/bin/ に置くが、
# /root は named volume になるのでイメージ側に保持できない。
# /usr/local/bin/opencode にバイナリを移して、/root の汚染を避ける。
#
# opencode のバージョン: 1.14.x を採用。以前 1.4.6 に pin していたのは
# 「1.14.x で Gemma 4 の build agent が 0 トークン silent 失敗」という観察からだが、
# 真因は別所 (llama-server 側の --reasoning-format 未指定 / xlsx のグローバル解決失敗) で、
# 2026-04 時点で両方修正済み。1.4.6 は Gemma 4 のネイティブ Harmony 形式
# (<|channel>thought ... <channel|> ...) を parse できず TUI に生テキスト＋
# "Failed to parse input at pos 13" が出るため、Harmony 対応済みの 1.14.x に戻す。
ARG OPENCODE_VERSION=1.14.19
RUN curl -fsSL https://opencode.ai/install | bash -s -- --version ${OPENCODE_VERSION} --no-modify-path && \
    mv /root/.opencode/bin/opencode /usr/local/bin/opencode && \
    rm -rf /root/.opencode

# read_excel.ts が require する xlsx をグローバルに入れておく。
# （ワークスペースごとに npm install する手間を省くため）
RUN npm install -g xlsx

# Claude Code CLI。Bash パネルから `claude` で起動する。
# npm global install で /usr/lib/node_modules/@anthropic-ai/claude-code/ に落ち、
# /usr/local/bin/claude シンボリックリンクが作られる (opencode と同じ配置ポリシー)。
# 認証は初回 `claude login` で OAuth 経由。トークンは /root/.config/claude-code/
# 配下に保存される。/root は named volume なので「コンテナ作り直し」後も
# ログイン状態は維持される。
# ネットワーク隔離 ON では api.anthropic.com に到達できないため利用不可 (README 参照)。
RUN npm install -g @anthropic-ai/claude-code

# opencode のカスタムツール (read_excel.ts) が ESM import で xlsx を解決できるよう、
# グローバル node_modules を NODE_PATH に入れる。未設定だと tsx の resolver が
# "/root/workspaces/<id>/.opencode/tools/read_excel.ts" の隣から node_modules を辿り、
# "Cannot find package 'xlsx'" でツールロードが即死 → opencode が無反応になる。
ENV NODE_PATH=/usr/lib/node_modules

# describe_image.ts / read_excel.ts / vision-rules.md / business-rules.md の
# テンプレート。新規ワークスペース作成時に /root/workspaces/{id}/ へコピーして
# 使う。イメージ内の固定配置先は /opt/myworkspaces/templates/。
RUN mkdir -p /opt/myworkspaces/templates/.opencode/tools
COPY templates/describe_image.ts /opt/myworkspaces/templates/.opencode/tools/
COPY templates/read_excel.ts /opt/myworkspaces/templates/.opencode/tools/
COPY templates/vision-rules.md /opt/myworkspaces/templates/
COPY templates/business-rules.md /opt/myworkspaces/templates/
COPY templates/opencode.json /opt/myworkspaces/templates/

WORKDIR /root

# docker-session 側で ["sleep", "infinity"] を上書き指定するのでここでは省略。
