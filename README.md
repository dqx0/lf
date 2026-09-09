# Logperch

Langfuse v4 のトレースを読むための、自分の PC で動く UI です。識別子検索 → 複数トレースのエラー確認 → 入出力と処理の文脈を読む、という流れに集中しています。

## 起動

Node.js 22 以降を使用します。

```sh
npm install
npm run dev
```

http://127.0.0.1:4310 を開いてください。「デモで操作を試す」から、接続せずにサンプルを確認できます。実データは「接続設定」で Langfuse v4 の URL とプロジェクトの Public Key / Secret Key を登録します。

ビルドして起動する場合:

```sh
npm run build
npm start
```

## 検索と閲覧

- `session_id: UUID`、`trace_id: ID`、`user_id: ID`、`observation_id: ID`、`metadata.request_id: ID` を完全一致検索します。`metadata.` 以降は API の metadata キーです。Langfuse に記録されているキーを指定してください。
- 項目名を省略した場合の検索項目は接続設定で変更できます。独自 ID も `metadata.キー` として登録できます。
- 検索期間は過去24時間・7日・30日・90日または任意期間。検索期間に該当する処理を起点に、同じトレースの全処理を期間制限なしで取得します。
- エラーは `level: ERROR` の処理を全トレースから集約します。正常終了した値の正誤は自動判定しません。
- エラーの有無によらず、左側の「すべての処理」から任意の実測値を開けます。処理名だけでなく入出力・metadata を含む取得済みデータを検索できます。
- 出力・入力・Metadata・全フィールドを切り替えられます。JSON のキーまたは拡大アイコンを選ぶと、その値だけを詳しく読めます。JSON 内に埋め込まれた JSON / Markdown / XML も対象です。
- 原文、本文検索、一致箇所のハイライト、折り返し、コピー、全画面表示に対応。`Ctrl/Cmd + K` で識別子欄へ移動、`Escape` で拡大表示を終了します。
- 検索の全ページを取得します。途中で失敗した場合、部分結果を全件取得済みとして表示しません。大量データで5分を超える場合は検索期間を狭めてください。

## 接続・データの扱い

Langfuse へのアクセスはローカルサーバーからの GET のみです。接続設定は `.local/connection.json` に保存し、Git 対象から除外します。Secret Key をブラウザーへ返さず、検索結果はブラウザーのメモリーだけに保持します。設定ファイルは平文なので、この PC のユーザーアカウントで管理してください。

サーバーは `127.0.0.1` のみにバインドし、Host / Origin を検証します。公開サーバーへの配備を前提としていません。Markdown の HTML は実行せず、外部画像は自動取得しません。

## API の対象と限界

Langfuse v4 の [Observations API v2](https://langfuse.com/docs/api-and-data-platform/features/observations-api) を使用します。v3 および旧 Trace API は対象外です。認証にはプロジェクトの Basic Auth を使います。構造化 filter に検索条件と日時条件をまとめ、カーソルで全ページを取得します。metadata は取得したキーを `expandMetadata` に指定して再取得します。

取得できるデータの範囲・反映遅延・保持期間は接続先 API に依存します。API が返さないデータや、過去の取り込み時点で欠落した内容は復元できません。トレース一覧は observations を traceId でまとめて構成します。プロンプト管理・評価管理・スコア取得・書き込み機能は含みません。

API 仕様参照: [公式スキーマ](https://github.com/langfuse/langfuse/blob/main/fern/apis/server/definition/observations.yml)。実環境のキーは同梱しません。実際のプロジェクトへの接続検証は利用環境で行ってください。

## 検証

```sh
npm test
npm run build
```

検索条件、カーソルページング、全トレース展開、metadata の再取得、空結果、途中失敗、認証エラー、無効な期間を模擬 API で検証します。
