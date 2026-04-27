"use client";

import { HelpRoot, Kbd, Section, Subsection } from "./help-primitives";

// Shell パネル裏面「コマンド集」タブ。
// Linux / bash にあまり馴染みのない初学者向けに、最低限のターミナルコマンドと
// Git コマンドを 1 ページにまとめる。網羅性ではなく「これだけ覚えれば動ける」
// 範囲に絞る。外部リンクや外部フェッチは一切しない (オフライン利用前提)。
export default function ShellCheatsheet({
  fontSize = 13,
}: {
  fontSize?: number;
}) {
  return (
    <HelpRoot variant="dark-indigo" fontSize={fontSize}>
      <Section title="このページの読み方">
        <p>
          コマンドは <code>$</code> プロンプトの後ろに打ちます (
          <code>$</code> は「打たない」ことに注意)。文中の{" "}
          <code>&lt;name&gt;</code> はあなたが自由に決める部分、
          <code>[opt]</code> は省略可能なオプションを表します。
        </p>
        <p>
          実行は <Kbd>Enter</Kbd>、途中で止めたいときは <Kbd>Ctrl</Kbd>+
          <Kbd>C</Kbd>。1 つ前に打ったコマンドは <Kbd>↑</Kbd> キーで呼び戻せます。
        </p>
      </Section>

      <Section title="今いる場所と移動">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code>pwd</code> — 現在地 (フルパス) を表示
          </li>
          <li>
            <code>ls</code> — 中身一覧 / <code>ls -la</code> は隠しファイル含む詳細
          </li>
          <li>
            <code>cd &lt;dir&gt;</code> — そこへ移動
          </li>
          <li>
            <code>cd ..</code> — 1 つ上 / <code>cd ~</code> — ホーム (
            <code>/root</code>) / <code>cd -</code> — 直前のディレクトリに戻る
          </li>
          <li>
            <code>tree -L 2</code> — 2 階層分のツリー表示 (見やすい)
          </li>
        </ul>
      </Section>

      <Section title="ファイルを作る・読む">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code>touch &lt;file&gt;</code> — 空ファイルを作る (タイムスタンプ更新も)
          </li>
          <li>
            <code>mkdir &lt;dir&gt;</code> — ディレクトリ作成 /{" "}
            <code>mkdir -p a/b/c</code> で多階層を一気に
          </li>
          <li>
            <code>cat &lt;file&gt;</code> — 全文を出力 (短いファイル向け)
          </li>
          <li>
            <code>less &lt;file&gt;</code> — スクロール表示 (<Kbd>q</Kbd> で終了)
          </li>
          <li>
            <code>head -n 20 &lt;file&gt;</code> — 先頭 20 行 /{" "}
            <code>tail -n 20</code> — 末尾 20 行
          </li>
          <li>
            <code>tail -f &lt;log&gt;</code> — ログを追記され続ける状態で見る
          </li>
        </ul>
      </Section>

      <Section title="ファイル操作 (コピー・移動・削除)">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code>cp &lt;src&gt; &lt;dst&gt;</code> — コピー /{" "}
            <code>cp -r</code> でディレクトリごと
          </li>
          <li>
            <code>mv &lt;src&gt; &lt;dst&gt;</code> — 移動 (リネーム兼用)
          </li>
          <li>
            <code>rm &lt;file&gt;</code> — 削除 /{" "}
            <code>rm -r &lt;dir&gt;</code> でディレクトリごと
          </li>
        </ul>
        <p className="mt-2 rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-200">
          ⚠ <code>rm</code> はゴミ箱を経由しません。<code>-rf</code>{" "}
          を付けると確認なしで全消去なので、対象を <code>ls</code>{" "}
          で先に確認する癖をつけましょう。
        </p>
      </Section>

      <Section title="探す">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code>grep &quot;TODO&quot; &lt;file&gt;</code> — 文字列検索 /{" "}
            <code>grep -rn &quot;TODO&quot; src/</code> でディレクトリ全部
          </li>
          <li>
            <code>find . -name &quot;*.ts&quot;</code> —
            ファイル名で再帰検索
          </li>
          <li>
            <code>which &lt;cmd&gt;</code> — そのコマンドが入っているか + 場所
          </li>
        </ul>
      </Section>

      <Section title="出力をつなぐ・記録する">
        <p>
          コマンド出力は他のコマンドに渡したり、ファイルに保存できます。
          1 行でいろいろ済ませるための仕組みです。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code>cmd1 | cmd2</code> — cmd1 の出力を cmd2 に渡す (
            <strong>パイプ</strong>)
          </li>
          <li>
            <code>cmd &gt; file.txt</code> — 出力をファイルに保存 (上書き)
          </li>
          <li>
            <code>cmd &gt;&gt; file.txt</code> — 末尾に追記
          </li>
          <li>
            <code>cmd 2&gt;&amp;1</code> — エラー出力も同じ流れに合流
          </li>
          <li>
            例: <code>ls -la | grep .json | head -5</code> — JSON ファイル上位 5
            件
          </li>
        </ul>
      </Section>

      <Section title="プロセスと環境">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code>ps -ef | head</code> — 動いているプロセス一覧
          </li>
          <li>
            <code>kill &lt;PID&gt;</code> — プロセスを終了 (効かないときは{" "}
            <code>kill -9 &lt;PID&gt;</code>)
          </li>
          <li>
            <code>top</code> — リアルタイムプロセス監視 (<Kbd>q</Kbd> で終了)
          </li>
          <li>
            <code>env</code> — 環境変数一覧 / <code>echo $PATH</code> — 単独確認
          </li>
          <li>
            <code>export FOO=bar</code> — このシェル内で環境変数を設定
          </li>
        </ul>
      </Section>

      <Section title="パッケージ管理 (Ubuntu)">
        <p>
          このパネルのコンテナは Ubuntu ベースです。<code>sudo</code>{" "}
          は不要 (すでに root)。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <code>apt-get update</code> — パッケージ目録を更新 (最初に 1 回)
          </li>
          <li>
            <code>apt-get install -y &lt;pkg&gt;</code> — パッケージを入れる
          </li>
          <li>
            <code>apt list --installed | head</code> — 入っているもの一覧
          </li>
          <li>
            <code>npm install -g &lt;pkg&gt;</code> — Node.js グローバルパッケージ
          </li>
        </ul>
      </Section>

      <Section title="Git の基本">
        <Subsection title="現在の状態を確認する">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <code>git status</code> — どのファイルが変わっているか
            </li>
            <li>
              <code>git diff</code> — 変更内容 (まだステージしていないもの)
            </li>
            <li>
              <code>git diff --staged</code> — ステージ済みの変更内容
            </li>
            <li>
              <code>git log --oneline -10</code> — 直近 10 件のコミット
            </li>
          </ul>
        </Subsection>

        <Subsection title="変更をコミットする">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <code>git add &lt;file&gt;</code> — そのファイルをステージ /{" "}
              <code>git add .</code> で全部
            </li>
            <li>
              <code>git commit -m &quot;メッセージ&quot;</code> — コミット作成
            </li>
            <li>
              <code>git commit --amend</code> —
              直前のコミットを編集 (まだ push してない時だけ)
            </li>
          </ul>
        </Subsection>

        <Subsection title="ブランチ操作">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <code>git branch</code> — ブランチ一覧 (現在地に <code>*</code>)
            </li>
            <li>
              <code>git switch -c feat/xxx</code> — 新規ブランチを切って移動
            </li>
            <li>
              <code>git switch main</code> — 既存ブランチに移動
            </li>
            <li>
              <code>git merge &lt;branch&gt;</code> — 現在のブランチに取り込む
            </li>
          </ul>
        </Subsection>

        <Subsection title="リモートとの同期">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <code>git clone &lt;url&gt;</code> — リポジトリを取ってくる (初回のみ)
            </li>
            <li>
              <code>git pull</code> — リモートの最新をローカルへ
            </li>
            <li>
              <code>git push</code> — ローカルのコミットをリモートへ
            </li>
            <li>
              <code>git push -u origin feat/xxx</code> — 新ブランチを初めて push
            </li>
          </ul>
        </Subsection>

        <Subsection title="やり直したいとき">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <code>git restore &lt;file&gt;</code> —
              まだコミットしていない変更を破棄
            </li>
            <li>
              <code>git restore --staged &lt;file&gt;</code> —
              ステージから外す (変更自体は残る)
            </li>
            <li>
              <code>git reset --soft HEAD~1</code> —
              直前のコミットを取り消す (変更は残す)
            </li>
            <li>
              <code>git stash</code> — 作業中の変更を一時退避 /{" "}
              <code>git stash pop</code> で戻す
            </li>
          </ul>
          <p className="mt-2 rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-200">
            ⚠ <code>git reset --hard</code> や <code>git push --force</code>{" "}
            は変更を完全に消したり、リモートを書き換えたりできてしまいます。
            まずは上記の <code>restore</code> / <code>stash</code> /{" "}
            <code>reset --soft</code> で済むか考えるのが安全です。
          </p>
        </Subsection>
      </Section>

      <Section title="困ったときの自助手段">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <code>man &lt;cmd&gt;</code> — マニュアル (<Kbd>q</Kbd> で終了、
            <code>/keyword</code> で検索)
          </li>
          <li>
            <code>&lt;cmd&gt; --help</code> — 多くのコマンドが対応している
            短いヘルプ
          </li>
          <li>
            <code>history | tail -20</code> — 過去に打ったコマンドを確認
          </li>
          <li>
            <code>clear</code> または <Kbd>Ctrl</Kbd>+<Kbd>L</Kbd> — 画面をきれいに
          </li>
          <li>
            <strong>分からないコマンドが出てきたら</strong> Coding パネルの AI に{" "}
            「<code>このコマンドの意味を教えて</code>」と聞くのが手っ取り早いです。
          </li>
        </ul>
      </Section>
    </HelpRoot>
  );
}
