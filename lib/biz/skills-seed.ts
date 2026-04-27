// Biz パネル向けスキルの初期テンプレ集。
//
// Phase C のシード対象。`seedDefaultSkills(sub)` がコンテナ内
// `~/.config/opencode/skills/<name>/SKILL.md` に未配置なら新規書き込みを行い、
// 既に配置済みなら冪等にスキップする。ユーザーが UI で編集したスキルを
// 上書きしないため「無ければ作る」だけにとどめる。
//
// 各スキル本体の規律 (引用フォーマット / 出力先 / 触ってはいけない領域) は
// business-rules.md と整合させる。ここでは「skill の役割と手順」に集中する。

export type SeedSkill = {
  name: string;
  description: string;
  body: string;
};

const DEEP_SEARCH_BODY = `# Business DeepSearch スキル

ユーザーの問いに対し、Web 上の一次情報を多段で集めて Markdown レポートに
まとめる。Biz パネルの **Web フェーズ** で利用するのが標準。

## 入出力

- **入力**: ユーザーからの問い (日本語可)
- **出力**: \`research/<slug>.md\` (1 ファイル / 1 トピック)
- \`<slug>\` は問いから kebab-case の英語スラグを生成 (例: 「2025 年の生成 AI 規制動向」 → \`2025-ai-regulation\`)

## ループの上限と打ち切り条件

- 検索 + 本文取得を合わせて **最大 5 ステップ** で打ち切る (発散防止)
- 引用は **3 件以上必須**。集まらなければ「未確認」と明示
- \`web_search\` 呼び出し: 1 ターン最大 5 回、うち \`read_url\` は最大 2 件

## 手順

1. **問いを 3〜5 個のサブクエリに分解**
   - 観点を分散 (定義 / 動向 / 競合 / 数値 / 反論)
   - 質問のままより、具体的な固有名詞・年・主体を入れる
2. **必ず最初に \`recall_research\` で過去レポートを確認**
   - 主要サブクエリで 1〜2 回 \`recall_research(query)\` を呼ぶ
   - ヒットした過去レポートのファイル名 / 要点を頭に入れてから web_search に進む
   - すでに同テーマがあれば「前回との差分」を意識して新規検索を絞る
3. **各サブクエリで \`web_search\` (max_results=5)**
   - 一次情報 (公式 / プレス / 公的統計 / arXiv / 学術機関) を優先
   - 二次情報 (まとめサイト / コピー記事) は採用しない
4. **上位 2 件を \`web_search read_url\` で本文取得**
   - 1 ステップ内で最大 2 件、合計 (5 ステップ) で 5〜10 件
5. **取得ごとに \`research/<slug>.md\` に追記**
   - \`## ステップ N: <観点>\` 見出し下に要点 3〜5 行
   - 引用は \`[^N]\` 脚注 + ファイル末尾に \`[^N]: <URL>\` を集約
6. **打ち切り判定**
   - 引用 3 件以上集まり、矛盾点が整理できたら終了
   - 集まらなければ最後に「未確認」セクションを書く

## 出力フォーマット

\`\`\`markdown
# <Topic Title>

> 調査開始: <YYYY-MM-DD> / 検索プロバイダ: <provider>

## 1. サマリ
- 3〜5 行で結論

## 2. 主要ファクト
- 数値 / 固有名詞は引用必須
- 例: 国内市場規模 5,400 億円 [^1]

## 3. 観点別の発見
### <観点 A>
- ...
### <観点 B>
- ...

## 4. 矛盾点 / 注意点
- 情報源で値が食い違う点
- 一次情報と Web 引用のズレ

## 5. 未確認事項
- どの検索でも裏が取れなかった事項

[^1]: https://example.com/...
[^2]: https://example.com/...
\`\`\`

## 禁止事項

- 推測で数値・固有名詞を書く (検索で得られない場合は「未確認」)
- 実装ファイル (\`.ts/.tsx/.py/.go\` 等) の \`write/edit\`
- 同じ URL を複数回 \`read_url\` する (内部 API は 5 分間キャッシュするため無効でもあり、無駄な API 消費)
- 「次に web_search を実行します」のような **ナレーションのみ** で済ませる (実際のツール呼び出し JSON を出力すること)

## Tool 呼び出しの具体例 (few-shot)

このスキルが起動したら、最初のターンで **必ず** 下記いずれかの形で web_search を発火させる。

**例 A**: ユーザーの問い「2025 年の国内 AI 規制動向を調べて」

\`\`\`json
{"tool": "web_search", "input": {"query": "AI規制 日本 2025 ガイドライン", "max_results": 5}}
\`\`\`

ツール結果が返ってきたら、上位 1〜2 件を read_url で本文取得:

\`\`\`json
{"tool": "web_search", "input": {"read_url": "https://www.meti.go.jp/example/release.html"}}
\`\`\`

**例 B**: ユーザーの問い「<企業名> の最新の事業動向」

\`\`\`json
{"tool": "web_search", "input": {"query": "<企業名> 決算 2025 事業セグメント", "max_results": 5}}
\`\`\`

考察・要約は **ツール結果が返ってからのみ** 書くこと。検索結果が無いまま推測で本文を書くのは禁止。
`;

const REPORT_BODY = `# Business Synthesize レポートスキル

\`reports/\` と \`research/\` 配下の成果物を統合して、Data / Doc / Web 三面ビュー
+ インサイトを 1 本のレポートにまとめる。Biz パネルの **Synthesize フェーズ**
で利用する標準スキル。

## 入出力

- **入力**: 既に存在する \`reports/data-*.md\` / \`reports/doc-*.md\` / \`research/*.md\`
- **出力**: \`reports/<topic>-summary.md\` (上書き可)

## 手順

1. \`bash ls reports/ research/\` で対象ファイル一覧を取得
2. 各ファイルを \`read\` で読み (Excel / PDF / 画像は再取得しない、既存サマリを使う)
3. **\`recall_research(<topic キーワード>)\` で過去の同テーマレポートを確認**
   - ヒットしたチャンクから「前回の結論 / 数値」を抽出
   - 今回の入力と比較して差分があれば後述の「## 6. 前回との差分」節に書く
4. \`<topic>\` のスラグはユーザー指示か、最頻ファイル名から推定
5. 下のフォーマットに沿って \`reports/<topic>-summary.md\` を生成

## 出力フォーマット

\`\`\`markdown
# <Topic Title> 統合レポート

> 生成日: <YYYY-MM-DD>
> 入力: data=<N>, doc=<N>, research=<N>

## 1. データ視点 (Data)
- reports/data-*.md からの要点 (path:line で出典)

## 2. ドキュメント視点 (Doc)
- reports/doc-*.md からの要点 (path, page N で出典)

## 3. Web 視点 (Web)
- research/*.md からの要点 ([^N] 脚注で出典)

## 4. 統合インサイト
- 一致点: 3 視点で結論が揃う事項
- 矛盾点: Data と Web、Doc と Web 等で値が食い違う事項
- 未確認: どの視点でも裏が取れなかった事項

## 5. 推奨アクション
- 箇条書き **5 個以内**

## 6. 前回との差分 (recall_research でヒットがあった場合のみ)
- 前回値 → 今回値 の比較
- 結論が変わった点 / 強化された点

[^1]: https://...
\`\`\`

## 禁止事項

- 推測で結論を書く (3 視点のいずれにも根拠がなければ「未確認」)
- 実装ファイル (\`.ts/.tsx/.py/.go\` 等) の \`write/edit\`
- \`reports/<topic>-summary.md\` 以外のファイルへの書き込み
`;

const DATA_EDA_BODY = `# Business Data EDA スキル

CSV / XLSX を起点に探索的データ分析 (EDA) を行い、表 + 簡易可視化込みの
Markdown レポートを書く。Biz パネルの **Data フェーズ** で利用する標準スキル。

## 入出力

- **入力**: \`@inputs/<file>.{csv,xlsx,xls,xlsm}\` (1 つ以上)
- **出力**: \`reports/data-eda-<topic>.md\`

## 手順

1. **概観**: \`read_excel\` で sheet と先頭 200 行を取得
2. **シート選定**: 複数シートがあるなら使うシートを明示 (タイトル列・ヘッダ行を識別)
3. **要約統計**: 数値列に対して count / mean / min / max / 欠損数 を表に
4. **カテゴリ列**: ユニーク数と上位カテゴリ (上位 5 件 + 件数)
5. **時系列がある場合**: 月次 / 四半期での推移をテキスト or Mermaid pie/xychart で表現
6. **異常値**: 明らかな外れ値 / 入力ミス疑いがあれば「データ品質メモ」節に列挙

## 出力フォーマット

\`\`\`markdown
# <Topic> データ EDA

> 入力: \`inputs/<file>.xlsx\` (sheet=<name>, rows=<N>)

## 1. 概要
- 行数 / 列数 / 期間 / 主な指標

## 2. 列ごとの要約
| 列 | 型 | 件数 | 欠損 | 範囲 |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## 3. カテゴリ列の分布
- \`region\`: 8 ユニーク。上位: 関東 (412) / 近畿 (231) / ...

## 4. 時系列の傾向
- 2024Q1 → 2024Q4 で売上 +18% / 受注数 -3%
- (任意) Mermaid xychart-beta で月次推移を可視化

## 5. データ品質メモ
- 5 行に \`region=\` の欠損
- 12 行で売上 0 (返品扱いの可能性)

## 6. 次の調査候補
- 箇条書き 3〜5 個 (どのカラムを深掘りすべきか)
\`\`\`

## 禁止事項

- ファイル名・列名から内容を **推測** で書く (実データを read_excel で必ず取得)
- 大きなシートを 1000 行超で読む (Excel ツールの上限)
- 実装ファイル (\`.ts/.tsx/.py/.go\` 等) の \`write/edit\`
`;

export const SEED_SKILLS: SeedSkill[] = [
  {
    name: "business-deep-search",
    description:
      "Biz Web フェーズ用。問いを 3-5 サブクエリに分解し web_search + read_url で多段調査、引用付き research/<slug>.md を生成する。",
    body: DEEP_SEARCH_BODY,
  },
  {
    name: "business-report",
    description:
      "Biz Synthesize 用。reports/ と research/ を統合し reports/<topic>-summary.md に Data/Doc/Web 三面ビューを書く。",
    body: REPORT_BODY,
  },
  {
    name: "business-data-eda",
    description:
      "Biz Data 用。@inputs/ の CSV/XLSX を read_excel で探索し reports/data-eda-<topic>.md に要約統計と分布を書く。",
    body: DATA_EDA_BODY,
  },
];
