"use client";

// Business パネル裏面「ヘルプ」タブ。
// このチャットでできること・想定シーン・機能の使い方を 1 枚でまとめる。
// 外部リンクや外部フェッチは一切しない (オフライン利用前提)。
export default function BusinessHelp({ fontSize = 13 }: { fontSize?: number }) {
  return (
    <div
      className="h-full overflow-y-auto bg-white"
      style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
    >
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-5 text-gray-800">
        <Section title="Business チャットとは">
          <p>
            opencode (AI コーディングエージェント) を、コードではなく
            <strong>業務資料や社内ドキュメント</strong>に対して使うためのパネルです。
            Markdown・PDF・Excel などを AI に読ませて、要約・Q&amp;A・下書き作成を
            任せることを想定しています。
          </p>
          <p>
            Coding パネルが「手を動かして実装する」相棒なら、Business パネルは
            「調べる・まとめる・言語化する」相棒です。
          </p>
        </Section>

        <Section title="表面 / 裏面">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <span className="font-medium text-emerald-700">表面 (チャット)</span> —
              セッション一覧・メッセージ履歴・入力カード。AI との対話の場。
            </li>
            <li>
              <span className="font-medium text-emerald-700">裏面</span> —
              AI に渡す素材・設定を整えるタブ (RAG ドキュメント / スキル / ヘルプ)。
              右上の ↕ ボタンで表裏を切り替えます。
            </li>
          </ul>
        </Section>

        <Section title="想定している利用シーン">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>業務 Markdown・PDF・Excel を読ませて要約や Q&amp;A をさせる</li>
            <li>プロジェクト資料の草案作成、議事録のドラフト起こし</li>
            <li>繰り返しの定型プロンプトを「スキル」として登録し、<code>/skill-name</code> で呼び出す</li>
            <li>社内用語が多い資料を RAG に取り込み、用語に強い応答を得る</li>
            <li>英語中心の思考ログは「日本語」タブで読める形に翻訳する</li>
          </ul>
        </Section>

        <Section title="主な機能">
          <Subsection title="チャット基本操作">
            <ul className="ml-5 list-disc space-y-1">
              <li><Kbd>Enter</Kbd> で送信、<Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> で改行</li>
              <li><code>/</code> を先頭に打つとスキルサジェストが表示される (<Kbd>Tab</Kbd> / <Kbd>Enter</Kbd> で挿入、<Kbd>Esc</Kbd> で閉じる)</li>
              <li>入力カードは会話末尾にインライン配置され、内容量に応じて自動で伸びる</li>
              <li>過去ログを遡るためにスクロールしている間は、新着トークンで下端に引き戻されない</li>
            </ul>
          </Subsection>

          <Subsection title="ストリーム統計 (入力カード下)">
            <ul className="ml-5 list-disc space-y-1">
              <li>生成中: <code>~N トークン · 経過秒 · トークン/秒 · コンテキスト利用率</code></li>
              <li>応答完了時に llama-server の <code>/tokenize</code> で実トークン数に差替</li>
              <li>コンテキストウィンドウ上限との比率も表示 (使い過ぎたら新規セッションへ)</li>
            </ul>
          </Subsection>

          <Subsection title="思考ログの日本語翻訳">
            <ul className="ml-5 list-disc space-y-1">
              <li>アシスタントの内部推論 (reasoning) は「思考ログ」として折りたためる</li>
              <li>「日本語」タブをクリックすると AI 翻訳がストリームで差し替わる</li>
              <li>翻訳結果はキャッシュされ、タブを往復しても再取得しない</li>
              <li>思考ログが delta で伸びた場合は「再翻訳」ボタンで最新化</li>
            </ul>
          </Subsection>

          <Subsection title="RAG ドキュメント (裏面)">
            <ul className="ml-5 list-disc space-y-1">
              <li>ドラッグ &amp; ドロップでファイルを取り込む</li>
              <li>取り込まれたドキュメントは chunk 単位で検索され、回答時に文脈注入される</li>
              <li>削除するとチャットからも参照されなくなる</li>
            </ul>
          </Subsection>

          <Subsection title="スキル (裏面)">
            <ul className="ml-5 list-disc space-y-1">
              <li>繰り返し使うプロンプト (レビュー / 要約 / 翻訳スタイル等) を登録</li>
              <li>チャット入力欄で <code>/name</code> とタイプして呼び出す</li>
              <li>Business / Coding の両方で共通のスキルとして使える</li>
            </ul>
          </Subsection>
        </Section>

        <Section title="Tips">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <strong>返答が噛み合わない</strong>: 関連ドキュメントを RAG に追加する、
              または狙いを明示したスキル本文にする。
            </li>
            <li>
              <strong>思考ログが長い</strong>: 日本語タブで流し読みするか、
              折りたたんだまま本文だけ読む。
            </li>
            <li>
              <strong>セッションの使い分け</strong>: プロジェクト / 案件単位で分けると
              コンテキストと履歴が追いやすい。
            </li>
            <li>
              <strong>スキル名の付け方</strong>: 半角英数とハイフンでシンプルに
              (<code>summary-jp</code>, <code>review-rfc</code> 等)。
              入力時のサジェストで選びやすくなる。
            </li>
          </ul>
        </Section>

        <Section title="よくある質問">
          <Faq q="コンテキスト利用率が 80% を超えたら?">
            新規セッションに切り替えましょう。過去履歴は左のサイドバーから再開できます。
            利用率は入力カード下の「コンテキスト」表示で常に確認できます。
          </Faq>
          <Faq q="思考ログの日本語翻訳が遅い">
            チャット本体と同じモデルで翻訳しているためです。専用の翻訳 LLM を
            別 llama-server として立て、<code>LLAMA_SERVER_URL</code> をそちらに
            向ければ高速化できます。
          </Faq>
          <Faq q="RAG に入れたドキュメントは他ユーザから見える?">
            アカウント単位で分離されています。あなたが取り込んだドキュメントは、
            あなたのセッションからのみ参照されます。
          </Faq>
          <Faq q="Business と Coding の使い分けは?">
            Coding は「実装を手伝ってもらう」向き (裏面が shell)。Business は
            「資料で会話する」向き (裏面が RAG / スキル / このヘルプ)。
            同じ opencode 基盤ですが、用途に応じて表面に並べて使えます。
          </Faq>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="border-b border-emerald-200 pb-1 font-semibold text-emerald-800"
        style={{ fontSize: "1.15em" }}
      >
        {title}
      </h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <h3 className="font-semibold text-gray-800" style={{ fontSize: "1em" }}>
        {title}
      </h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="rounded border border-gray-200 bg-gray-50/60">
      <summary className="cursor-pointer select-none px-3 py-1.5 font-medium text-gray-800 hover:bg-gray-100">
        Q. {q}
      </summary>
      <div className="border-t border-gray-200 px-3 py-2 text-gray-700">
        {children}
      </div>
    </details>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 font-mono text-gray-700 shadow-sm"
      style={{ fontSize: "0.85em" }}
    >
      {children}
    </kbd>
  );
}
