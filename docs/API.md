# v1 API / 生成と評価の境界

正本は `shared/openapi.json`。破壊的変更は2人で合意してから行い、呼び出し側とfixtureを同じPRで更新します。

## POST /api/v1/thumbnails

Content-Type: application/json。同期APIです。入力は最大16KiB。

```json
{"title":"初心者のAI入門","genre":"education"}
```

title: trim後1〜60 Unicodeコードポイント、制御文字・改行不可。
genre: education / gaming / vlog / other、省略時other。未知の項目は400。
成功200は `apiVersion`, `mode`, `input`, `candidates`, `elapsedMs` を返します。
候補は必ず3件、`assessment.overall` 降順。同点は生成順。

```json
{
  "id":"UUID",
  "style":"bold",
  "mimeType":"image/svg+xml",
  "imageDataUrl":"data:image/svg+xml;base64,...",
  "width":1280,
  "height":720,
  "metadata":{"textLength":9,"lineCount":1,"fontSize":76,"foreground":"#facc15","background":"#172554"},
  "assessment":{
    "overall":95,
    "kind":"layout_heuristic",
    "version":"0.1.0",
    "metrics":{"contrast":90,"brevity":100,"font":100},
    "reasons":["配色のコントラスト比: ..."],
    "limitations":["画像内容・ジャンル適合は未評価。","CTR予測や効果保証ではありません。"]
  }
}
```

上記は候補1件の形の説明用。実際の値は入力と配色から計算します。
エラーは常に `{"error":{"code":"INVALID_INPUT","message":"説明"}}`。

| HTTP | code | 原因 |
|---|---|---|
| 400 | INVALID_INPUT / INVALID_JSON | 入力またはJSON不正 |
| 413 | BODY_TOO_LARGE | 入力上限超過 |
| 415 | UNSUPPORTED_MEDIA_TYPE | JSON以外 |
| 405 | METHOD_NOT_ALLOWED | thumbnailsにPOST以外 |
| 404 | NOT_FOUND | 未定義URL |
| 503 | PROVIDER_UNAVAILABLE | 未実装のプロバイダー設定 |
| 500 | INTERNAL_ERROR | 内部処理失敗 |

GET /api/v1/health は200 `{"status":"ok","mode":"demo"}`。
認証・永続化・リトライ・ジョブキューはまだありません。

## 内部モジュール

`generate(input) → Promise<Candidate[]>`: generation担当。3件、異なるid、画像と採点用metadataを返す。
`score(candidate, input) → Promise<Assessment>`: scoring担当。overallとmetricsは0〜100。生成側の実装をimportせず、入力契約に依存する。
`runPipeline(body)` が入力検証→生成→並列評価→ソートを担当。
現在の採点は「コントラスト50%・短さ30%・文字サイズ20%」という設計上の仮説。実測CTRで校正していません。
背景画像を使う場合、現在のmetadataによる配色評価だけでは不十分です。文字領域の実画像分析へ置き換え、versionとkindを更新すること。

## AI接続時の実装順

1. generationにプロバイダーadapter追加。キーはサーバー環境変数のみ。外部通信に期限と費用上限を設ける。
2. 背景生成→文字を確定配置→1280×720のPNG/JPEGへ合成。mimeTypeとdata URLを一致させる。
3. scoreに実画像分析を追加し、サンプル20件で人の選好と比較。CTRと選好を混同しない。
4. data URLは初期用。画像が大きくなる前に保存先URL契約と非同期ジョブAPIを共同設計。
