"use client";

import { Faq, HelpRoot, Kbd, Section } from "./help-primitives";

// Shell (Ubuntu) パネル裏面「ヘルプ」タブ。
// AI を介さず素の bash を直接触りたいケースに特化したガイド。
// 外部リンクや外部フェッチは一切しない (オフライン利用前提)。
export default function ShellHelp({ fontSize = 13 }: { fontSize?: number }) {
  return (
    <HelpRoot variant="dark-indigo" fontSize={fontSize}>
      <Section title="Shell パネルとは">
        <p>
          ユーザー専用 Docker コンテナ (
          <code>myworkspaces-shell-&#123;userId&#125;</code>) に
          直接アタッチした<strong>素の bash</strong>です。
          opencode を介さないので、AI とのやり取り抜きで
          自分の手で apt や git や long-running プロセスを動かしたいときに使います。
        </p>
        <p>
          Coding / Analyze パネルの裏面 Bash が「タブ離脱で切れる軽量 pty」なのに対して、
          こちらは<strong>パネルを開いている間は同じ pty が生き続ける</strong>
          常駐前提の作業面です。
        </p>
      </Section>

      <Section title="表面 / 裏面">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <span className="font-medium text-indigo-300">表面 (シェル)</span> —
            xterm.js による bash ターミナル。コンテナの <code>/root</code> から始まる。
          </li>
          <li>
            <span className="font-medium text-indigo-300">裏面 (ヘルプ)</span> —
            このページ。右上の ↕ ボタンで表裏を切り替えます。
          </li>
        </ul>
      </Section>

      <Section title="想定している利用シーン">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <code>apt install</code> / <code>npm i -g</code> 等で
            コンテナにツールを追加したい
          </li>
          <li>
            <code>opencode</code> コマンドを直接起動して TUI 版
            (Tab で Plan/Build 切替、<Kbd>Ctrl</Kbd>+<Kbd>P</Kbd>{" "}
            コマンドパレット等) を使いたい
          </li>
          <li>
            <code>tail -f</code> / <code>top</code> /{" "}
            <code>docker logs</code> など常駐モニタリング
          </li>
          <li>
            ワークスペース外 (<code>/root</code> 直下や{" "}
            <code>~/.config/opencode/</code> 等) のファイルを編集したい
          </li>
          <li>
            git のサブコマンド (<code>git rebase -i</code>,{" "}
            <code>git stash</code> 等) を対話操作したい
          </li>
        </ul>
      </Section>

      <Section title="コンテナ構成">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            イメージ: <code>myworkspaces-sandbox:latest</code>{" "}
            (ubuntu:24.04 ベース、Node.js / git / curl / vim / opencode CLI 同梱)
          </li>
          <li>
            <code>/root</code> はユーザーごとの named volume{" "}
            <code>myworkspaces-home-&#123;userId&#125;</code> に永続化
          </li>
          <li>
            ワークスペース実体は <code>/root/workspaces/&#123;wsId&#125;/</code>
          </li>
          <li>
            ネットワークは隔離モードがあり、必要なら設定パネルから切替可能
          </li>
        </ul>
      </Section>

      <Section title="他のパネルとの違い">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong>Coding / Analyze 裏面 Bash</strong> — タブ離脱で pty が切れる
            軽量 shell。表面 chat の cwd と同じ位置にいる。短い確認・grep 用。
          </li>
          <li>
            <strong>Shell (このパネル)</strong> — 永続 pty。
            <code>/root</code> から始まり、長時間プロセスや root 操作も可能。
          </li>
          <li>
            <strong>opencode chat</strong> — AI 経由のファイル操作。
            シェルの権限はあるが手作業ではなく LLM に任せる。
          </li>
        </ul>
      </Section>

      <Section title="ターミナル操作">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            コピー: テキスト選択 → <Kbd>Cmd</Kbd>+<Kbd>C</Kbd>
            (macOS) / <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>C</Kbd> (Linux/Win)
          </li>
          <li>
            ペースト: <Kbd>Cmd</Kbd>+<Kbd>V</Kbd> /{" "}
            <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>V</Kbd>
          </li>
          <li>
            プロセス停止: <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd>
          </li>
          <li>
            シェル終了: <code>exit</code> (パネル右上の{" "}
            <Kbd>×</Kbd> でも閉じられる)
          </li>
          <li>
            フォントサイズ: タイトルバー右の <code>−</code> /{" "}
            <code>+</code> で変更 (パネル横断で記憶)
          </li>
        </ul>
      </Section>

      <Section title="便利スニペット">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            既存ワークスペースに移動:{" "}
            <code>cd ~/workspaces &amp;&amp; ls</code>
          </li>
          <li>
            opencode TUI で開く:{" "}
            <code>cd ~/workspaces/&#123;id&#125; &amp;&amp; opencode</code>
          </li>
          <li>
            シンボル grep:{" "}
            <code>grep -rn &quot;TODO&quot; src/ | head -50</code>
          </li>
          <li>
            ホストにファイル取り出し: パネル下部にドラッグ&amp;ドロップで
            アップロード可能 (Workspace パネル経由)
          </li>
        </ul>
      </Section>

      <Section title="よくある質問">
        <Faq q="Coding パネルの Bash と何が違う?">
          Coding 裏の Bash はタブを離れた瞬間に pty が落ちます。
          Shell パネルは閉じない限り pty が生き続けるので、
          <code>tail -f</code> や <code>npm run dev</code> 等の常駐用途は
          こちら向きです。
        </Faq>
        <Faq q="root 権限で apt install したい">
          コンテナ内ではすでに root として動いているので、そのまま{" "}
          <code>apt-get update &amp;&amp; apt-get install &lt;pkg&gt;</code>
          が通ります。<code>sudo</code> は不要 (むしろ未インストール)。
        </Faq>
        <Faq q="いったんパネルを閉じても作業状態は残る?">
          コンテナ自身と <code>/root</code> ボリュームは永続なので、
          ファイルは残ります。一方で、走らせていたフォアグラウンド
          プロセスは pty が切れた時点で死ぬので、長時間動かすものは{" "}
          <code>nohup</code> + <code>&amp;</code> や <code>tmux</code> で
          バックグラウンド化してから閉じてください。
        </Faq>
        <Faq q="ネットワークが繋がらない">
          設定で外部ネットワーク隔離モードに入っている可能性があります。
          ヘッダの <code>🔒 隔離中</code> バッジが出ていたら、Workspace パネルの
          設定からネットワークを通常モードに戻してください。
        </Faq>
        <Faq q="コンテナを作り直したい">
          Workspace パネルの設定に「コンテナをリセット」があります。
          実行すると <code>/root</code> ボリューム以外がクリーンになり、
          イメージ更新も反映されます (ファイルは残ります)。
        </Faq>
      </Section>
    </HelpRoot>
  );
}
