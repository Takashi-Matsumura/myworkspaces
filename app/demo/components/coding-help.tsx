"use client";

import { Faq, HelpRoot, Kbd, Section, Subsection } from "./help-primitives";

// Coding パネル裏面「ヘルプ」タブ。
// 実装を手伝ってもらう用途に特化した 1 枚ガイド。
// 外部リンクや外部フェッチは一切しない (オフライン利用前提)。
export default function CodingHelp({ fontSize = 13 }: { fontSize?: number }) {
  return (
    <HelpRoot variant="dark" fontSize={fontSize}>
      <Section title="Coding パネルとは">
        <p>
          opencode (AI コーディングエージェント) を
          <strong>実装作業の相棒</strong>として使うためのパネルです。
          現在のワークスペース (<code>/root/workspaces/&#123;id&#125;</code>)
          を cwd として、ファイルの読み書きやコマンド実行を AI に任せられます。
        </p>
        <p>
          Business パネルが「調べる・まとめる・言語化する」相棒なら、
          Coding パネルは「手を動かして実装する」相棒です。
          バックエンドは同じ opencode serve を共有しているため、
          片方で作ったセッションはもう片方からも続きを書けます。
        </p>
      </Section>

      <Section title="表面 / 裏面">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <span className="font-medium text-emerald-300">表面 (チャット)</span> —
            セッション一覧・メッセージ履歴・入力カード。AI との対話の場。
          </li>
          <li>
            <span className="font-medium text-emerald-300">裏面</span> —
            3 タブ構成 (Bash / ヘルプ / スキル)。作業に使う道具を並べる側。
            右上の ↕ ボタンで表裏を切り替えます。
          </li>
        </ul>
      </Section>

      <Section title="想定している利用シーン">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>新機能の実装・既存コードのリファクタを相談しながら進める</li>
          <li>バグ調査 (スタックトレースを貼る・再現手順を書かせる)</li>
          <li>テストやドキュメントの雛形生成</li>
          <li>
            繰り返し使う依頼 (レビュー観点・コミットメッセージ整形・テスト生成等) を
            「スキル」として登録し <code>/skill-name</code> で呼び出す
          </li>
          <li>英語中心の思考ログは「日本語」タブで読める形に翻訳する</li>
        </ul>
      </Section>

      <Section title="主な機能">
        <Subsection title="チャット基本操作">
          <ul className="ml-5 list-disc space-y-1">
            <li><Kbd>Enter</Kbd> で送信、<Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> で改行</li>
            <li><code>/</code> を先頭に打つとスキルサジェスト (<Kbd>Tab</Kbd> / <Kbd>Enter</Kbd> で挿入、<Kbd>Esc</Kbd> で閉じる)</li>
            <li>入力カードは会話末尾にインライン配置。内容量に応じて自動で伸びる</li>
            <li>過去ログを遡っている間は、新着トークンで下端に引き戻されない</li>
          </ul>
        </Subsection>

        <Subsection title="ストリーム統計 (入力カード下)">
          <ul className="ml-5 list-disc space-y-1">
            <li>生成中: <code>~N トークン · 経過秒 · トークン/秒 · コンテキスト利用率</code></li>
            <li>応答完了時に llama-server の <code>/tokenize</code> で実トークン数に差替</li>
            <li>コンテキスト上限との比率も表示 (80% 越えたら新規セッションへ)</li>
          </ul>
        </Subsection>

        <Subsection title="思考ログの日本語翻訳">
          <ul className="ml-5 list-disc space-y-1">
            <li>アシスタントの内部推論 (reasoning) は「思考ログ」として折りたためる</li>
            <li>「日本語」タブで AI 翻訳をストリームで差し替え、結果はキャッシュ</li>
            <li>思考ログが delta で伸びたら「再翻訳」ボタンで最新化</li>
          </ul>
        </Subsection>

        <Subsection title="セッション共有 (Coding ⇔ Business)">
          <ul className="ml-5 list-disc space-y-1">
            <li>同じ opencode serve を使うので、セッション一覧は両パネルで同じ</li>
            <li>Coding で作ったセッションは Business 側サイドバーにも即反映</li>
            <li>ワークスペースを切り替えると両方のセッション一覧が更新される</li>
          </ul>
        </Subsection>
      </Section>

      <Section title="裏面 Bash の使い方">
        <p>
          チャットから抜けて直接コマンドを打ちたい時の避難ハッチです。
          表面チャットと同じワークスペース cwd にアタッチします。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>初めて Bash タブを開いた瞬間に pty が起動する (ローカルリソースに優しい lazy mount)</li>
          <li>別タブに切り替えると pty は切断される
            (<code>top</code> や <code>tail -f</code> のような常駐は想定外)</li>
          <li>長時間モニタが要るときは後述の Ubuntu パネルへ</li>
          <li>コピペは右クリック選択 → <Kbd>Cmd</Kbd>+<Kbd>C</Kbd></li>
        </ul>
      </Section>

      <Section title="裏面スキル">
        <p>
          Business 裏面のスキルタブと同じ CRUD で、同じデータを編集します
          (保存先は <code>~/.config/opencode/skills/</code> のユーザー全体スキル)。
          Coding / Business どちらからでも <code>/name</code> で呼べます。
        </p>
      </Section>

      <Section title="Ubuntu パネルとの違い">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong>Coding 裏面 Bash</strong> — 作業 cwd に閉じた軽い脱出ハッチ。
            タブ離脱で pty が切れる前提の軽量用途向け。
          </li>
          <li>
            <strong>Ubuntu パネル</strong> — AI なしの素の bash。<code>sudo</code> で
            apt などコンテナ管理も可能。<code>opencode</code> を直接起動すれば
            従来の TUI (Tab で Plan/Build 切替、Ctrl+P コマンドパレット等) が使えるので、
            チャット UI より TUI が好みの人はこちら。
          </li>
        </ul>
      </Section>

      <Section title="Tips">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong>コンテキスト 80% 超</strong>: 新規セッションへ切り替え。
            履歴は左サイドバーからいつでも再開できる。
          </li>
          <li>
            <strong>大きな資料を参照させたい</strong>: Business 裏面の RAG に入れて、
            Coding からチャットすれば自動で文脈注入される (セッションは共有)。
          </li>
          <li>
            <strong>スキル名の付け方</strong>: 半角英数とハイフンで短く
            (<code>refactor-ts</code>, <code>write-tests</code>, <code>explain-diff</code> 等)。
          </li>
          <li>
            <strong>応答が詰まったら</strong>: 入力カード下の「停止」ボタンで中止 →
            プロンプトを書き直して再送。
          </li>
        </ul>
      </Section>

      <Section title="よくある質問">
        <Faq q="前にあった opencode TUI (Tab で Plan/Build 切替等) はもう使えない?">
          Coding パネル表面は React チャットに置き換わりました。TUI を使いたい場合は
          <strong>Ubuntu パネルを開き、bash 上で <code>opencode</code> を直接起動</strong>
          してください。Coding パネル表面と同じ opencode serve を見るので、
          セッションは引き続き共有されます。
        </Faq>
        <Faq q="Business パネルと何が違う?">
          表面チャット UI はほぼ同じですが、裏面のタブが異なります。
          Business は RAG ドキュメント中心 (資料で会話する用途)、
          Coding は Bash 中心 (実装作業用の避難ハッチ)。同じ opencode 基盤ですが、
          用途に応じて並べて使えます。
        </Faq>
        <Faq q="古いセッションが増え続けて見づらい">
          セッション一覧の各行にホバーすると右端にゴミ箱アイコンが出るので、
          不要な会話はそこから削除できます。Coding で削除した結果は Business 側にも
          即反映されます。
        </Faq>
        <Faq q="Bash タブに打ったコマンド履歴は残る?">
          タブを離れると pty が切れるため、そのセッション内の <code>history</code> は
          失われます。残したいコマンドは Ubuntu パネル側で実行するか、
          スクリプトとしてワークスペースに保存するのがおすすめです。
        </Faq>
      </Section>
    </HelpRoot>
  );
}
