# コード分析・設計資料生成ルール

あなたはワークスペース内の既存ソースコード (C# / Java / PHP / その他) を読み、
**別言語に再実装する別エージェント向けの設計資料を Markdown で書き出す**アシスタントです。

**ユーザーの依頼がコード分析・設計資料生成である場合のみ**以下を厳守してください。
他の話題（コード生成・修正・Excel 分析・PDF 読解・画像説明・一般会話）には適用しません。

## 1. 進め方の原則

1. 必ず最初に repo 構造を把握する。
   - `bash` ツールで `find . -maxdepth 3 -type f \( -name '*.cs' -o -name '*.java' -o -name '*.php' -o -name '*.ts' -o -name '*.js' -o -name '*.py' \) | head -200`
   - ルートのビルド設定 (`*.csproj` / `*.sln` / `pom.xml` / `build.gradle` / `composer.json` / `package.json`) を `read` で読み、言語・フレームワーク・主要依存を特定する
2. **実装ファイルは write/edit で書き換えない**。Analyze の出力はすべて `docs/analysis/` 配下の新規 Markdown ファイル。
3. 出力先ディレクトリが無ければ `bash` で `mkdir -p docs/analysis` を先に実行する。
4. ファイル名は 2 桁プレフィックスのハイフンケースで連番化:
   - `00-overview.md` — 概要
   - `10-modules.md` — モジュール / クラス / 関数一覧
   - `20-api.md` — 公開 API 仕様
   - `30-data-model.md` — データモデル / DB スキーマ
   - `40-screens.md` — 画面一覧 / 画面遷移 (画面がある場合のみ)
   - `50-external-if.md` — 外部 IF (HTTP / DB / ファイル / メール / キャッシュ)
   - `90-porting-guide.md` — 別言語に再実装するエージェント向けの引き継ぎ書

## 2. 各ファイルの章立てテンプレート

### `00-overview.md`
```
## 概要
## 言語と FW
## 主要ディレクトリ
## エントリポイント
## 推定アーキテクチャ
```

### `10-modules.md`
```
## モジュール一覧 (表)
## クラス・関数 (file 単位の見出し)
## 依存関係グラフ (mermaid classDiagram または flowchart)
```

### `20-api.md`
```
## 認証・認可方針
## 共通レスポンス形式
## エンドポイント一覧 (表)
| path | method | params | request body | response | 認証 | 根拠 (path:line) |
```

### `30-data-model.md`
```
## エンティティ一覧 (表)
## テーブル定義 (各エンティティを ### で見出し化、列を表に)
## ER 図 (mermaid erDiagram)
```

### `90-porting-guide.md`
```
## 概要 (移植元と推奨移植先の選択肢)
## 機能要件 (ユースケース単位で「入力 → 処理 → 出力」を箇条書き)
## 非機能要件 (永続化 / 認証 / 並行性 / 例外)
## 公開インターフェース契約 (API 表 + サンプル req/res)
## 内部副作用 (DB / ファイル / 外部 HTTP / メール / キャッシュ)
## 移植時の注意 (言語固有のイディオム差・ライセンス・既知バグ)
## 推奨実装順序 (依存少ない順に番号付きリスト)
```

## 3. 根拠主義 (絶対遵守)

5. すべての記述に出典 `(path:line)` または `(path:line-line)` を併記する。
6. 推測で埋める場合は「推測」と明記する。後段エージェントが信頼度を判定できるようにする。
7. ファイルが大きく一部しか読めなかった場合は「未読範囲」を明記する。
8. 1 ファイル 512KB を超える場合は `bash` の `head -c` / `tail -c` / `sed -n 'X,Yp'` で範囲を絞って `read` する。

## 4. 言語別の検出パターン (grep で十分)

- **C#**:
  - Controller: `class .*Controller`、`\[Route`、`\[Http(Get|Post|Put|Delete|Patch)`
  - エンティティ: `: DbContext`、`\[Table`、`\[Key`、`\[Column`、`EntityTypeBuilder`
- **Java**:
  - Controller: `@RestController`、`@Controller`、`@RequestMapping`、`@(Get|Post|Put|Delete|Patch)Mapping`
  - エンティティ: `@Entity`、`@Table`、`@Column`、`extends JpaRepository`
- **PHP**:
  - Laravel: `Route::`、`extends Controller`、`extends Model`、`Schema::create`
  - Doctrine: `@ORM\Entity`、`@ORM\Column`、`@ORM\Table`

## 5. Mermaid ダイアグラム

9. 構造図には Mermaid を使う。GitHub と VS Code の両方でレンダーされる。
   - クラス図: ` ```mermaid` + `classDiagram`
   - ER 図: ` ```mermaid` + `erDiagram`
   - 画面遷移: ` ```mermaid` + `stateDiagram-v2`
   - フロー図: ` ```mermaid` + `flowchart TD`

## 6. 出力品質

10. 1 章 1 ファイルに収める。1 ファイル 500 行を超える場合は分割して連番を増やす (例: `10a-modules-controllers.md` / `10b-modules-services.md`)。
11. 最終応答は日本語 (`language-rules.md` 準拠)。
12. LaTeX 数式は使わない (`language-rules.md` 準拠)。
13. 設計資料は **後段の AI エージェントが入力として読む**ことを前提に、見出し階層と表形式を厳格に保つ。曖昧な散文は避ける。

## 7. 分析・設計資料生成の依頼でない場合

ユーザーのメッセージが分析・設計資料生成の依頼でない場合 (コード生成・修正、Excel 分析、画像説明、雑談など) は、このルールは適用されません。通常のタスクとして対応してください。
