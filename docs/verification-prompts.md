# myworkspaces 検証用サンプルプロンプト集

OpenCode + Gemma 4 (またはその他モデル) のコード生成・ビジネス機能の品質評価に使う標準プロンプト。

**運用ルール**

- 検証は**新規ワークスペース**で行う。既存ワークスペースはファイルが蓄積して context が散らかるので比較になりにくい
- モデル / ルール構成を変えたら同じプロンプトで再実施。結果を `docs/verification-log.md`（任意）に追記すると比較できる
- サンプルファイル (`project-proposal.pdf` / `sales-2026.xlsx`) は新規ワークスペースにコピーしてから使う

## サンプルファイルの配布手順

検証開始時、ホスト側から Coding の Workspace パネル (DnD アップロード) で `docs/samples/` の 2 ファイルを対象ワークスペースにアップロードする。

- `docs/samples/project-proposal.pdf` — 数ページ構成の日本語プロジェクト提案書
- `docs/samples/sales-2026.xlsx` — 複数シート・日本語列名を含む 2026 年の売上データ

---

## A. Coding 品質 (Stage 1-5 の評価に使う)

### A-1. Python pygame テトリス (基本難度)

```
Python の pygame で動作するテトリス (Tetris) を作ってください。

要件:
- ファイルは main.py の 1 ファイルで完結させる (分割しない)
- 操作: ←→ 左右移動、↑ 回転、↓ ソフトドロップ、スペースでハードドロップ
- 7 種類のテトリミノを実装し、ラインクリア・スコア表示・GameOver 検出まで入れる
- 依存は `pip install pygame` のみ
- 最後に `bash` ツールで `python3 main.py` を起動し、最低限 1 秒走って例外が出ないことを確認してから完了宣言すること
- coding-rules.md に従い、pass / TODO / 「実際には…」のような未実装スタブを残さない
```

判定: 起動成功 / ブロックが落下する / 操作で動かせる / ライン消去が発動する の 4 条件で 0〜4 点。

### A-2. Python TODO CLI (最低難度、必ず通したいライン)

```
argparse を使った TODO 管理 CLI を Python で作ってください。

要件:
- ファイルは todo.py の 1 ファイル
- サブコマンド: add <text> / list / done <id> / rm <id>
- 保存先は ~/.todo.json (なければ自動作成)
- 最後に `bash` ツールで以下をこの順で実行して動作確認:
  python3 todo.py add "買い物"
  python3 todo.py list
  python3 todo.py done 1
  python3 todo.py list
- すべて exit 0 で終わること
```

判定: 4 コマンド全部が機能するか。テトリスで時間切れ・循環バグでも、これは通って欲しい最低ライン。

### A-3. Next.js テトリス (Next.js テンプレート問題の検証)

```
このワークスペースに既に `create-next-app` で雛形が作成されています。
app/page.tsx を書き換えて、Canvas ベースで動作するテトリスを実装してください。

要件:
- 操作: ←→ 移動、↑ 回転、↓ ソフトドロップ
- ラインクリア・スコア表示・GameOver 検出を実装
- 完成後、npm run dev が既に起動中なのでブラウザで http://localhost:3000 (コンテナ内) でページが表示されることを `bash` ツール (curl) で HTTP 200 を確認
- page.tsx 以外の不要ファイル修正は行わない
```

判定: 初期テンプレートが置き換わっているか / 実際にテトリスが動くか。

### A-4. Python 電卓 GUI (tkinter)

```
tkinter で動作する電卓 GUI を Python で作ってください。

要件:
- ファイルは calc.py の 1 ファイル
- 四則演算 (+ - × ÷) とクリア (C) ボタン
- 小数と負数を扱える
- 最後に `bash` ツールで `python3 -c "import calc; print('ok')"` を実行し、構文エラーなしを確認
- 完成した GUI は実行時に初めて画面が出るが、import だけは必ず exit 0 になること
```

---

## B. Business 機能 (Excel / PDF / Image)

### B-1. Excel 基本集計

前提: `sales-2026.xlsx` を対象ワークスペースにアップロード済み。

```
sales-2026.xlsx の内容を確認して、以下を教えてください。
1. シートが何枚あるか
2. 各シートの列名と行数
3. 売上の合計金額 (全シート合算)
4. 月別の売上推移 (表で)
```

判定: `read_excel` ツールが呼ばれるか (推測で答えないか) / 数値が実ファイルと一致するか。

### B-2. Excel 異常検知

```
sales-2026.xlsx の中で、異常値と思われる行を指摘してください。
- 前月比で大きく乖離した値
- 外れ値 (平均 ± 2σ を超えるなど)
- 明らかな入力ミスと思われるもの

`read_excel` の結果のみを根拠に回答し、推測や創作は禁止です。
```

判定: 実データに基づくか / LaTeX を使わないか (language-rules.md)。

### B-3. PDF 要約

前提: `project-proposal.pdf` をアップロード済み。

```
project-proposal.pdf の内容を要約してください。
- 提案の目的
- 主要なスケジュールとマイルストーン
- 必要な予算・リソース
- リスクと対策

箇条書きで、各項目 3-5 行以内で。
```

判定: `read_pdf` ツールが呼ばれるか / ファイル名から内容推測していないか。

### B-4. PDF 特定情報抽出

```
project-proposal.pdf から、以下の情報だけを抽出して表形式で示してください。
| 項目 | 値 |
|------|-----|
| プロジェクト名 | ... |
| 開始予定日 | ... |
| 完了予定日 | ... |
| 総予算 | ... |
| 担当部署 | ... |

PDF 内に記載がない項目は「(記載なし)」と明示してください。創作禁止。
```

---

## C. 複合タスク (Coding + Business)

### C-1. Excel をグラフ化する Python スクリプト

```
sales-2026.xlsx を読み込んで、月別売上の棒グラフを matplotlib で生成し、
PNG として sales-chart.png に保存する Python スクリプトを書いてください。

要件:
- ファイルは chart.py
- 依存: pandas, openpyxl, matplotlib (pip install で事前に入れる)
- 日本語列名をそのままラベルに使う (日本語フォント設定もスクリプト内で行う)
- 最後に `bash` ツールで `python3 chart.py` を実行し、sales-chart.png が生成されたことを `ls -la sales-chart.png` で確認
```

判定: コード完走 + PNG 生成の 2 段で評価。Coding の難度 + Business の実データ利用の複合。

---

## 検証結果の記録フォーマット (任意)

実施ごとに以下を記録すると stage 間比較が楽になる。

```markdown
## <日付> / <モデル> / <Stage構成>

### A-1 Tetris (pygame)
- 起動: 成功 / 失敗
- 落下: あり / なし
- 操作: あり / なし
- ラインクリア: あり / なし
- 備考: <目視した問題>

### A-2 TODO CLI
- add / list / done / rm: 4/4 ・ 3/4 ・ ...
- 備考:

### A-3 Next.js Tetris
- テンプレ置換: 済 / 未
- 動作: 済 / 未
- 備考:

### B-1 Excel 集計
- read_excel 使用: yes / no
- 数値一致: ○ / △ / ×
- 備考:
```
