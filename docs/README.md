# docs/

myworkspaces の機能評価・検証用資材を置く場所。プロジェクトの実装ファイルとは別扱い。

## 構成

- `verification-prompts.md` — Coding / Business 機能の標準評価プロンプト集
- `samples/project-proposal.pdf` — PDF 処理検証用の日本語提案書
- `samples/sales-2026.xlsx` — Excel 処理検証用の複数シート売上データ

## 使い方

1. 検証対象の構成 (モデル / ルールファイル / Stage 構成) を固定する
2. **新規** ワークスペースを作成する
3. `docs/samples/` のファイルを Workspace パネルに DnD でアップロード
4. `verification-prompts.md` の該当セクションのプロンプトを送る
5. 結果を記録 (任意で `verification-log.md` など)

既存ワークスペース (context が散らかっているもの) では比較にならないので使わない。
