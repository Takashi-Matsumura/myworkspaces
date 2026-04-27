"use client";

import { Faq, HelpRoot, Kbd, Section, Subsection } from "./help-primitives";

// Analyze パネル裏面「ヘルプ」タブ。
// 既存ソースコードを「読み解いて設計資料に書き起こす」用途に特化したガイド。
// 外部リンクや外部フェッチは一切しない (オフライン利用前提)。
export default function AnalysisHelp({ fontSize = 13 }: { fontSize?: number }) {
  return (
    <HelpRoot variant="dark-violet" fontSize={fontSize}>
      <Section title="Analyze パネルとは">
        <p>
          opencode (AI コーディングエージェント) を、
          <strong>既存ソースコードの読み解きと設計資料化</strong>
          に特化させたパネルです。Coding パネルが「実装する」相棒、
          Business パネルが「資料を読む」相棒なのに対して、Analyze パネルは
          「コードを読んで Markdown に書き起こす」相棒です。
        </p>
        <p>
          ファイルを書き換えるのではなく、ワークスペース内に
          <code>docs/analysis/&#42;.md</code> を生成するのが基本動作です。
          移植・引き継ぎ・レビュー前のキャッチアップ等、
          「他人 (もしくは未来の自分) に渡す資料を作る」場面を想定しています。
        </p>
      </Section>

      <Section title="表面 / 裏面">
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <span className="font-medium text-violet-300">表面 (チャット)</span> —
            セッション一覧・メッセージ履歴・モード/テンプレ・入力カード。
          </li>
          <li>
            <span className="font-medium text-violet-300">裏面</span> —
            3 タブ構成 (Bash / ヘルプ / スキル)。grep や find で実物を確認しながら
            分析を進めるための作業面。右上の ↕ ボタンで表裏を切り替えます。
          </li>
        </ul>
      </Section>

      <Section title="想定している利用シーン">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>知らないリポジトリを引き継いだ直後の全体像把握</li>
          <li>レガシーアプリ (C# / Java / PHP 等) を別言語に移植する前の棚卸し</li>
          <li>レビュー前に「どこが何をやっているか」を一度文章化したいとき</li>
          <li>API 仕様書やデータモデル定義が散逸している repo の現状凍結ドキュメント化</li>
        </ul>
      </Section>

      <Section title="モード (Survey / Detail / Port)">
        <p>
          入力カード上のフェーズボタンで、AI に与えるプロンプトの prefix が切り替わります。
          選び間違えても結果は出ますが、出力先 .md とフォーマットが揃わなくなるので、
          基本は順番通り進めるのを推奨します。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-violet-300">Survey</strong> —
            repo 全体の構造把握。<code>docs/analysis/00-overview.md</code> を生成。
            言語・FW・主要ディレクトリ・エントリポイントを 1 枚にまとめる。
          </li>
          <li>
            <strong className="text-violet-300">Detail</strong> —
            詳細抽出。<code>10-modules.md</code>(クラス・関数一覧) /
            <code>20-api.md</code>(API 表) / <code>30-data-model.md</code>(ER 図)
            を必要に応じて生成。
          </li>
          <li>
            <strong className="text-violet-300">Port</strong> —
            移植ガイド作成。既存の <code>00〜30</code> を読み込み、
            <code>90-porting-guide.md</code> として「別言語実装エージェント向けの
            引き継ぎ書」を書き出す。
          </li>
        </ul>
      </Section>

      <Section title="クイックテンプレート">
        <p>
          入力欄上部のボタンを押すと、よく使う指示が下書きに展開されます。
          そのまま送ってもよく、末尾の「補足」欄に対象範囲・注意点を書き足してから
          送ると精度が上がります。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>全体像把握</strong> — Survey 用。find / read を回して
            <code>00-overview.md</code> を書く。
          </li>
          <li>
            <strong>クラス・関数一覧</strong> — Detail 用。public な
            クラス・メソッドを抽出して <code>10-modules.md</code> に表化。
          </li>
          <li>
            <strong>API 仕様抽出</strong> — Detail 用。Route/Controller の
            アノテーションを grep し <code>20-api.md</code> に表化。
          </li>
          <li>
            <strong>データモデル抽出</strong> — Detail 用。Entity / Schema /
            Migration を読み <code>30-data-model.md</code> に ER 図と表を書く。
          </li>
          <li>
            <strong>移植ガイド作成</strong> — Port 用。
            <code>00〜30</code> を読み <code>90-porting-guide.md</code> に統合。
          </li>
        </ul>
      </Section>

      <Section title="主な機能">
        <Subsection title="チャット基本操作">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <Kbd>Enter</Kbd> で送信、<Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> で改行
            </li>
            <li>
              <code>/</code> を先頭に打つとスキルサジェスト
              (<Kbd>Tab</Kbd> / <Kbd>Enter</Kbd> で挿入、<Kbd>Esc</Kbd> で閉じる)
            </li>
            <li>テンプレを押した直後は補足欄を埋めてから送信するのが推奨</li>
            <li>過去ログを遡っている間は、新着トークンで下端に引き戻されない</li>
          </ul>
        </Subsection>

        <Subsection title="出力先 (docs/analysis/)">
          <ul className="ml-5 list-disc space-y-1">
            <li>すべての成果物は <code>docs/analysis/&#42;.md</code> に集約</li>
            <li>
              連番プレフィックス (<code>00-</code> / <code>10-</code> /
              <code>20-</code> / <code>30-</code> / <code>90-</code>)
              でフェーズが見分けられる
            </li>
            <li>
              実装ファイル (<code>src/</code> 等) は AI が書き換えないように
              モード prefix で抑止している
            </li>
            <li>
              根拠は <code>(path:line)</code> 形式で AI に必ず併記させる規約
            </li>
          </ul>
        </Subsection>

        <Subsection title="思考ログの日本語翻訳">
          <ul className="ml-5 list-disc space-y-1">
            <li>アシスタントの内部推論 (reasoning) は折りたためる</li>
            <li>「日本語」タブで AI 翻訳をストリームで差し替え、結果はキャッシュ</li>
            <li>思考ログが delta で伸びたら「再翻訳」ボタンで最新化</li>
          </ul>
        </Subsection>

        <Subsection title="セッション共有 (Coding / Business / Analyze)">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              バックエンドの opencode serve は 3 パネルで共有しており、
              セッション一覧は同じものを見る
            </li>
            <li>
              Analyze で書いた <code>docs/analysis/00-overview.md</code> を
              Coding で <code>@docs/analysis/00-overview.md</code> として参照すれば、
              「分析 → 実装」のバトンパスが自然に行える
            </li>
          </ul>
        </Subsection>
      </Section>

      <Section title="裏面 Bash の使い方">
        <p>
          ワークスペース cwd にアタッチした軽量 shell です。
          AI に頼まず自分で <code>ls</code> / <code>grep</code> / <code>find</code>{" "}
          を打って実物を確認したいときの避難ハッチとして使います。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>初めて Bash タブを開いた瞬間に pty が起動する (lazy mount)</li>
          <li>
            別タブに切り替えると pty は切断される
            (<code>tail -f</code> 等の常駐は想定外)
          </li>
          <li>長時間モニタが要るときは Ubuntu パネルへ</li>
        </ul>
      </Section>

      <Section title="裏面スキル">
        <p>
          Coding / Business と同じデータを編集します
          (<code>~/.config/opencode/skills/</code> に保存されるユーザー全体スキル)。
          Analyze 固有の繰り返しプロンプト
          (例: <code>summarize-folder</code> / <code>diff-vs-prev</code>) を
          登録しておくと <code>/name</code> で即呼び出せます。
        </p>
      </Section>

      <Section title="Tips">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong>分析対象が大きすぎて読み切れない</strong>: Survey で全体を撮って
            ディレクトリ単位に分割し、Detail を各ディレクトリで回す。
          </li>
          <li>
            <strong>テンプレ通りに書いてくれない</strong>: モードと出力先パスを
            人間側で再指定 (例:「<code>docs/analysis/10-modules.md</code> に
            書いて」と明示) すると改善することが多い。
          </li>
          <li>
            <strong>移植ガイドを別言語向けに最適化したい</strong>: Port テンプレ末尾の
            「移植先言語」欄に <code>Go / Rust / TypeScript</code> 等を書くと、
            言語固有のイディオム差が章立てに反映されやすくなる。
          </li>
          <li>
            <strong>AI が実装ファイルを書き換えそうになったら</strong>:
            プロンプトに「<code>src/</code> 配下は read のみ」を追記して止める。
          </li>
        </ul>
      </Section>

      <Section title="よくある質問">
        <Faq q="Coding パネルとどう使い分ける?">
          書き先で分けます。Analyze は <code>docs/analysis/&#42;.md</code> しか書かない、
          Coding は <code>src/</code> 等のソースを書き換える、という棲み分けです。
          まず Analyze で「現状」を凍結 → Coding で「変更」を入れる、
          という二段構えが安全です。
        </Faq>
        <Faq q="既存の docs/analysis/ を上書きされたくない">
          プロンプトに「既存ファイルがあれば <code>read</code> のみで参照し、
          書き込みは新規ファイル <code>NN-yymmdd-name.md</code> に」と明示すると、
          既存が温存されたまま追補されます。
        </Faq>
        <Faq q="生成された Markdown の根拠 (path:line) が間違っている">
          小さいモデルだと line 番号がズレることがあります。Bash タブで
          <code>grep -n</code> 結果を貼って「上の grep 結果と整合させて」と
          再依頼すると修正されやすいです。
        </Faq>
        <Faq q="Survey の概観だけ短く欲しい (詳細は要らない)">
          Survey モードのまま、補足欄に「概要は箇条書き 5 行以内、詳細不要」と
          書いて送ると、テンプレ通りの章構成は維持しつつ短く出ます。
        </Faq>
      </Section>
    </HelpRoot>
  );
}
