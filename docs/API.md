# v1 API / 生成と評価の境界

正本は `shared/openapi.json`。破壊的変更は2人で合意してから行い、呼び出し側とfixtureを同じPRで更新します。

完成PNG比較用の`/complete-gallery.js`・`/complete-gallery-model.js`・`/complete-gallery-store.js`は静的配信ルートです。画像と人の選択はブラウザ内に保存し、既存の完成画像API入力やCandidate/Assessmentを変更しません。画像付きの非公開JSONは`complete-comparison-1.1.0`（未採点）、全組の集計付きJSONは`complete-comparison-report-1.0.0`で、画像資産APIの提案とは別形式です。実費と保存結果は人が確認して入力し、未確認はnull/unknown。採点側への正式取り込みは形式レビュー待ちです。詳細はdocs/COMPLETE-COMPARISON.md。

Day5の `/review`・`/review.js`・`/comparison-model.js`・`/comparison-store.js` は静的な比較画面とブラウザ保存のための配信ルートです。画像・人の評価はIndexedDBに保存し、この画面からAPIへ送信しません。Candidate/Assessmentの契約は変更しません。採点担当のCSV書き出し・ローカル分析はdocs/DAY5.mdを参照してください。

写真の `/api/v1/complete-thumbnail` は任意の `composition` を受け付けます。省略時auto、指定値はauto / text_left / text_right / text_top。写真に応じた構図希望を画像編集APIの指示へ加えます。既存の入力はそのまま使え、Candidate/Assessmentには影響しません。ai-complete-0.1.2の指示変更は、実画像の品質を確認してから評価します。完成PNGは未採点、1回1枚、手動同意・期限・起動内回数制限は維持します。この共有入力の追加は相互レビュー対象です。

## POST /api/v1/thumbnails

Content-Type: application/json。同期APIです。入力は最大16KiB。

```json
{"title":"初心者のAI入門","genre":"education"}
```

title: trim後1〜60 Unicodeコードポイント、制御文字・改行不可。
genre: education / gaming / vlog / other、省略時other。未知の項目は400。
成功200は `apiVersion`, `mode`, `input`, `candidates`, `elapsedMs` を返します。
modeは `demo` または `ai_background`。後者はAI背景1枚を共有した3レイアウト案で、画像内容の採点は未実装。
候補は必ず3件。並び順は下記「評価（Assessment）」の「候補の並び順」に従う（未評価の項目の組み合わせでグループにまとめ、グループ内は `assessment.overall` 降順、同点は生成順）。

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
    "overall":50,
    "overallMax":100,
    "coverage":50,
    "unevaluated":["contrast"],
    "weights":{"contrast":50,"brevity":30,"font":10,"fit":10},
    "kind":"layout_heuristic",
    "version":"0.4.0",
    "metrics":{"contrast":null,"brevity":100,"font":100,"fit":100},
    "reasons":["評価方法: metadataのtextLayout（v1.0.0）","コントラスト: 未評価（タイトル文字の背面が画像で、単色と確認できないため）。","..."],
    "limitations":["文字と背面のコントラストは未評価です。...","CTR予測や効果保証ではありません。"]
  }
}
```

上記は候補1件の形の説明用（AI背景C3で、背面が画像のためコントラストが未評価の例）。実際の値は入力と文字配置から計算します。

## 評価（Assessment、採点0.4.0）

レイアウトの仮説的な指標です。CTR予測や効果保証ではありません。重みと閾値は仮説で、実データで校正していません。

| 項目 | 型 | 意味 |
|---|---|---|
| `metrics.contrast` / `brevity` / `font` / `fit` | 0〜100の整数、または `null` | `null` は未評価で、0点とは区別する |
| `unevaluated` | 文字列の配列 | 未評価の項目名（`contrast, brevity, font, fit` の順）。すべて評価済みなら `[]` |
| `overall` | 0〜100の整数 | 未評価の項目を0点とみなした総合点（下限） |
| `overallMax` | 0〜100の整数 | 未評価の項目を満点とみなした総合点（上限）。すべて評価済みなら `overall` と同じ |
| `coverage` | 0〜100の整数 | 評価できた項目の重みの合計（%） |
| `weights` | オブジェクト | 重み（%、合計100）。現在は contrast 50 / brevity 30 / font 10 / fit 10 |
| `kind` | `layout_heuristic` | 変更なし |

- `contrast`：タイトルの全行が正常な値で、背面（`textBackdrop`）が `solid` と確認できた場合だけ評価。metadataの配色では代用しない。
- `brevity`：`metadata.textLength` から評価（15文字を超えた分を減点）。
- `font`：文字サイズのみ（48px以上で満点＝検証前の仮値）。タイトルの行が無いときは `metadata.fontSize` を使う。
- `fit`：タイトルの全行が測定済み（`measurement` が `rendered` / `estimated`、寸法が `null` でない、正常な値）の場合だけ、`textRegion` からの上下左右のはみ出しで評価。`estimated` は根拠に「推定」と書く。
- `unknown`・`null`・異常値は評価済みに数えず、SVG解析でも補わない。画像が無い・壊れている・形式が一致しない場合は `contrast` と `fit` を未評価にする。
- `overall`〜`overallMax` は、未評価の項目を0点〜満点にしたときの計算上の範囲で、統計的な信頼区間やCTR予測ではない。

### 候補の並び順と表示
1. `unevaluated` の中身が同じ候補をグループにまとめる。
2. グループは生成時に最初に現れた順。グループ間の順序は品質の順位を意味しない。
3. グループ内は `overall` が高い順、同点は生成順。
4. 画面では点数を幅で示し（同じなら1つの値）、評価済みの内訳と未評価の項目・理由を並べる。「評価できた項目からの暫定範囲」と説明し、未評価を低品質と表現しない。グループをまたいで総合点だけで優劣を示さない。

並び順（pipeline）と画面は生成側が対応する。
エラーは常に `{"error":{"code":"INVALID_INPUT","message":"説明"}}`。

| HTTP | code | 原因 |
|---|---|---|
| 400 | INVALID_INPUT / INVALID_JSON | 入力またはJSON不正 |
| 413 | BODY_TOO_LARGE | 入力上限超過 |
| 415 | UNSUPPORTED_MEDIA_TYPE | JSON以外 |
| 405 | METHOD_NOT_ALLOWED | thumbnailsにPOST以外 |
| 404 | NOT_FOUND | 未定義URL |
| 503 | PROVIDER_UNAVAILABLE | 未実装のプロバイダー設定 |
| 503 | API_KEY_MISSING / PAID_GENERATION_DISABLED / PROVIDER_CONFIG / PROVIDER_AUTH | キー・有効化・制限設定・権限の問題 |
| 429 | GENERATION_BUSY / GENERATION_LIMIT / PROVIDER_RATE_LIMIT | 同時実行・起動中の回数・外部APIの制限 |
| 502 | PROVIDER_ERROR / PROVIDER_RESPONSE / PROVIDER_NETWORK | 外部API失敗・不正応答・接続失敗 |
| 504 | PROVIDER_TIMEOUT | 生成期限超過（課金される可能性あり） |
| 500 | INTERNAL_ERROR | 内部処理失敗 |

GET /api/v1/health は200 `{"status":"ok","mode":"demo"}`。
modeは生成設定に応じてai_background。healthはAPIキーの有効性や外部APIの疎通を保証しない。
認証・永続化・リトライ・ジョブキューはまだありません。

## 内部モジュール

`generate(input) → Promise<Candidate[]>`: generation担当。3件、異なるid、画像と採点用metadataを返す。
`score(candidate, input) → Promise<Assessment>`: scoring担当。overall・overallMax・coverageは0〜100の整数、metricsの各項目は0〜100の整数または null（未評価）。生成側の実装をimportせず、入力契約に依存する。
`runPipeline(body)` が入力検証→生成→並列評価→ソートを担当。
現在の採点の重みは「コントラスト50%・短さ30%・文字サイズ10%・収まり10%」という設計上の仮説（`assessment.weights` でも返す）。実測CTRで校正していません。
背景画像の上の文字（`textBackdrop.kind` が `image` / `unknown`）は、現在コントラストを未評価（`null`）にしています。文字領域の実画像分析を加える場合は、versionを更新し、必要ならkindも見直すこと。

## AI接続時の実装順

1. generationにプロバイダーadapter追加。キーはサーバー環境変数のみ。外部通信に期限と費用上限を設ける。
2. 背景生成→文字を確定配置→1280×720のPNG/JPEGへ合成。mimeTypeとdata URLを一致させる。
3. scoreに実画像分析を追加し、サンプル20件で人の選好と比較。CTRと選好を混同しない。
4. data URLは初期用。画像が大きくなる前に保存先URL契約と非同期ジョブAPIを共同設計。

採点用metadataにgeneration_versionとtextLayoutを追加しました。旧候補では省略可能です。
座標・推定寸法・行の役割・背面の定義はdocs/METADATA-PROPOSAL.mdを参照してください。
人工fixtureはdocs/fixtures/generation-metadata.jsonです。採点側0.3.0への対応は別ブランチで進めます。

Day 3: SVG内の文字は同梱フォントから生成したpathです。PNGは画面側で変換・保存します。採点はmetadata.textLayoutの使用が必要です。追加依存はnpm ciで導入します。

## POST /api/v1/complete-thumbnail（実験・有料）

写真1枚からAIが文字と構図まで仕上げる。title（1〜120文字）、brief（1〜1000文字）、headline（1〜80文字、改行可）、imageDataUrl（1280×720 PNG、3MB以内）、consent:true が必須。入力JSON上限4MB。1536×864 PNG1枚と生成版・未評価事項を返す。Candidate/Assessmentは返さず採点pipelineを通さない。既存APIの契約は維持。画像はサーバーで保存せずOpenAIへ送信する。文字・人物保持と品質の目視確認が必要。

モデルgpt-image-2.5-flare、images/edits、medium品質、n=1。画像生成と編集は同じプロセス内の回数・同時実行制限を共有。失敗も1回、自動再試行なし。金額のハード上限ではない。参考: https://developers.openai.com/api/reference/resources/images/methods/edit

serverとOpenAPIの新規経路は相互レビュー対象。採点側ではai_completeを既存候補のように評価しない。

health に completeGeneration（enabled、keyConfigured、busy、calls、maxCalls）を追加。秘密値は返さず、エディターで生成可能な設定と回数上限を表示する。

