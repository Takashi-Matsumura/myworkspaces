# 検証ログ

`docs/verification-prompts.md` のプロンプトを使って実施した検証結果を追記する。Stage 構成・モデル・温度を変えたときの差分比較用。

---

## 2026-04-25 / Gemma 4 E4B IT (Q4_K_M) / Stage 1-4 全有効

### 構成

- モデル: `gemma-4-e4b-it-Q4_K_M.gguf` (llamacpp 経由)
- 有効な Stage: 1 (coding-rules.md) + 2 (prefix 注入 + UI テンプレ) + 3 (Plan/Build agent) + 4 (temperature plan=0.4 / build=0.2)
- ワークスペース: `verify-stage4` (新規作成、タスク履歴なし)

### テストケース: A-2 風 「簡易メモ帳 CLI」 (argparse + add/list/del + ~/.memo.json)

#### Plan モード (1 通目)

- 入力: 新規アプリテンプレ展開 + memo.py 仕様
- 結果: **計画は text で返答** / `.opencode/plans/*.md` への write は発生せず
- tool 発火数: 0
- 所見: Plan agent の「edit denied / plans のみ allow」制約を Gemma 4 が「read-only フェーズ」として認識し、ファイル書き込みを回避して text 回答に逃げた。本来は `.opencode/plans/xxx.md` に計画書を write すべきだが、それには誘導できなかった。

#### Build モード (2 通目)

- 入力: 「上の計画に従って memo.py を実装し、動作確認まで行ってください」
- 結果: **✅ 期待通り動作**
  - `memo.py` が完全実装で生成 (3244 バイト、未実装スタブなし、動作するコード)
  - `/root/.memo.json` が生成され、最終状態 `[{id:2, text:"掃除"}]` で検証コマンド 5 本すべて成功した痕跡あり
- tool 発火数: 6 (1 write + 5 bash)

#### Tool call 詳細

| # | tool | 引数 | status |
|---|---|---|---|
| 1 | `write` | `{filePath: "memo.py", content: <2608文字>}` | completed |
| 2 | `bash` | `python3 memo.py add "買い物"` | completed |
| 3 | `bash` | `python3 memo.py add "掃除"` | completed |
| 4 | `bash` | `python3 memo.py list` | completed |
| 5 | `bash` | `python3 memo.py del 1` | completed |
| 6 | `bash` | `python3 memo.py list` | completed |

**全引数が正しく埋まっており、以前観測された `Write (path 不明) / tool 実行なし` は再現しなかった**。

### 判定

- Stage 1-4 の組み合わせで、Gemma 4 E4B でも**ある程度シンプルなタスクは完走できる**ことを実証
- 以前の Tetris (Python/Next.js) 失敗との差:
  - タスクの複雑度が低い (4 サブコマンド + JSON 読み書きのみ)
  - 明示的な動作確認コマンドが prompt に列挙されている
  - Plan → Build の 2 段階で思考負荷が分散されている
  - temperature 0.2 で JSON 生成が安定

### 残課題

- Plan モードで `.opencode/plans/*.md` を書かない問題 (text 回答で逃げる)
- より複雑なタスク (Tetris レベル、複数ファイル) で同じ結果が得られるかは未検証
- テンプレート本文が「実装」まで指示しているので Plan モードと噛み合わない (将来の改善点)
