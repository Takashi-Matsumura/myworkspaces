# samples/

Analyze パネル検証用のサンプルソースコード。

各ディレクトリは別言語の "Hello, World!" 実装で、Greeter クラスとビルド設定ファイルを含む。
Workspace パネルにフォルダごと DnD でアップロードして Analyze パネルから動作確認に使う。

| ディレクトリ | 言語 | ビルド設定 |
|---|---|---|
| `csharp-hello/` | C# / .NET 8 | `HelloWorld.csproj` |
| `java-hello/` | Java 17 | `pom.xml` (Maven) |
| `php-hello/` | PHP 8.1+ | `composer.json` |

## 検証手順

1. myworkspaces で新規ワークスペースを作成
2. Workspace パネルに 3 ディレクトリのいずれか (または全て) を DnD アップロード
3. **Analyze ボタン**で AnalysisConsole を開き、新規セッションを作成
4. フェーズ `Survey` のまま「**全体像把握**」テンプレを送信
5. 完了後 Bash パネルで `cat docs/analysis/00-overview.md` を確認
6. 続けて Detail / Port フェーズで他のテンプレも実行

## 注意

これは Analyze パネル動作検証のための **最小サンプル**で、本番用途のリファレンス実装ではない。
