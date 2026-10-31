# v1 API / 生成と評価の境界

2026-11-01：OpenAPI0.3.11。追加写真を最大3枚（メインと合計4枚）へ拡張。4枚生成0.13.0、比較1.12.0、下書きZIP/A固定case1.2.0、画像資産1.2.0・診断0.1.3・解析dataset1.11.0。4枚入力と完成PNG1枚の診断を最大5資産とし、旧版は最大4資産を維持。生成本文36MiB、入力固定14MiBへ拡張し、診断32MiB/JSON45MiBは維持。1〜3枚の版と旧記録は維持、Candidate/Assessment・採点側ファイル・依存は不変。shared/server/解析の拡張は相互レビュー対象。[詳細と人工fixture](MULTI-PHOTO.md)。

2026-11-01：referenceMode requiredの生成を0.12.1へ更新。写真の小さい補正と元の肌・ピントの質感を優先し、実例の色調を写真へ転写しない指示を追加。明示された写真パネルは強制的な切り抜きより優先する。旧APIの生成指示・保存画像とOpenAPI0.3.10の構造は維持し、版の説明と人工fixtureを更新。新指示ファイルもA固定のコードハッシュへ含める。shared/解析互換性は相互レビュー対象。[詳細](NATURAL-PHOTO-FINISH.md)。

2026-10-31：OpenAPI0.3.10。`referenceMode: required`を通常エディターへ追加し、空欄でないvisualIntentと観察済み100件を生成前に必須確認する。生成0.12.0、参考記録1.1.0にpoolSize/poolSha256/visualIntentSha256を追加。参考プレビューと無料入力固定も同じ条件で選ぶ。旧off/auto/省略のAPIと旧記録は維持。shared/server/解析の互換性は相互レビュー対象。Candidate/Assessment、採点側ファイル、pipeline、依存は維持。[詳細・人工fixture・限界](REQUIRED-REFERENCES.md)。

2026-10-31：OpenAPI 0.3.9。完成生成と無料入力固定に任意の`additionalImageDataUrls`（最大2枚）を追加。複数写真は生成0.11.0と順序付き`sourcePhotoSha256s`、画像資産1.1.0と`additionalSourcePhotoAssetIds`、比較1.11.0・解析dataset1.10.0・A固定case1.1.0へ対応します。生成本文32MiB、固定10MiB、診断は合計4資産を維持。1枚写真・Candidate/Assessment・pipeline・採点側ファイル・依存は維持。shared/server/解析の変更は相互レビュー対象。[全契約・移行・未対応範囲](MULTI-PHOTO.md#共有契約への影響と限界)。

2026-10-25：1280×720・拡大切り取りなし・上限内のPNGは、元のバイトをそのまま送信する。固定時と生成時は同じ取得処理を使い、PNGの再圧縮による比較写真のハッシュ変更を避ける。別サイズ・JPEG・切り取り・修正元は従来の処理を維持。非同期読込より前に生成ボタンをロックし、そのクリック時点の入力を保持する。API構造・OpenAPI 0.3.8・生成指示・版0.10.2・依存は不変。

2026-10-25：生成0.10.2は、元写真の背景・物体保持と自動見出しの重要情報の保持を明確化。既存のvalidationA応答を比較1.10.0・解析dataset1.9.0・下書きへ保持し、写真と正規化した送信条件のハッシュを読込時にも照合します。試行履歴1.1.0に画像受信時間・PNGハッシュ・生成版・任意の照合結果を追加。APIのJSON構造・OpenAPI 0.3.8・Candidate/Assessment・モデル・枚数・品質・依存は維持。sharedの照合結果の正規化と解析互換性は相互レビュー対象です。[記録の範囲と検証](NEXT-GENERATION.md)。

2026-10-24：A固定のchatgptPromptをPR #11の通常の短い依頼文へ修正。サービス内部の詳細ルールを転記せず、旧依頼文は保持する。API構造・OpenAPI 0.3.8・完成生成版0.10.1・Candidate/Assessmentは維持。sharedの依頼文生成関数とserverの静的配信1件、ZIP補足comparison-protocol.jsonを追加し、相互レビュー対象とする。[比較条件・旧記録・契約の影響](VALIDATION-A-FREEZE.md)。

2026-10-21：生成0.10.1は元写真の人物のみを使う指示を全design・参考・評価メモ・修正生成へ適用。人物がいない写真に人物を足さず、修正元だけの追加人物を除くよう指示します。Aの比較用依頼文にも同じ条件を加えます。入力・応答の形、OpenAPI 0.3.8、Candidate / Assessment、モデル・品質・枚数は維持。人物の自動照合は未実装です。[指示と検証の範囲](SOURCE-PEOPLE-POLICY.md)。

2026-10-19：生成0.9.1で、初回の素材再構成に「少なくとも1つの元素材の切り抜きと、背景に対する位置か大きさの変更」を明記。文字追加・全体の切り取りだけを再構成の達成として扱わず、写真全体を前提にした9候補はrecomposeへ送らない。修正生成では変更指示のない構成を保つ。追加の有料生成は実施しておらず、実画像での再構成の達成と品質は未確認。[詳細](PHOTO-MATERIAL-RECOMPOSITION.md)。 OpenAPI 0.3.7の形は維持し、designの説明だけを更新。

2026-10-19：生成0.9.0、OpenAPI 0.3.7。designに任意のrecomposeを追加し、元写真の素材の切り抜き・再配置を指示できるようにする。既定はautoのまま。A固定・下書き・比較ZIP・解析も希望したdesignを保持する。共有enumと生成指示は相互レビュー対象。[方式と互換性](PHOTO-MATERIAL-RECOMPOSITION.md)。

2026-10-19：生成0.8.0。通常生成でdesign/compositionが両方autoの場合に、9つの条件付き字体・配置候補を同じ画像編集の指示へ加える。元の実例画像・動画文言は送らない。手動design/compositionと修正生成では今回の候補を追加しない。新ファイルをA固定のコードハッシュへ含める。入力・応答・OpenAPIの形は維持、説明のみ更新。sharedの自動指示とA固定対象は相互レビュー対象。[詳細](REFERENCE-PATTERNS.md)。

2026-10-15：無料の`POST /api/v1/validation-a/freeze`でA検証の写真・入力・実行コード・モデル設定を固定する。完成PNG生成には任意の`X-Validation-A-Case`ヘッダーを追加し、条件の不一致・評価メモ・修正元はプロバイダー呼び出し前に拒否。照合した成功応答のみ任意の`validationA`を返す。ヘッダーなしの既存API・Candidate/Assessment・比較JSONは維持する。OpenAPI 0.3.7、人工fixtureはfixtures/validation-a.json。静的配信のvalidation-a.jsと任意の下書きvalidationAを追加。共同レビュー対象。[形式・照合・限界](VALIDATION-A-FREEZE.md)。

2026-10-15：A（最初の1枚）とB（評価による好みへの適応）を主な仮説として検証する。評価メモはgroupId全体のSHA-256で決めたdevだけを使い、約3割のholdoutを除外する。新しい生成要求もholdoutを拒否。解析dataset1.7.0にsplit・feedbackUsed・feedbackUsageKnown・過去のholdout利用の監査を追加。旧画像と記録は変えない。比較手順はVALIDATION-PLAN.md。

2026-10-15：人物範囲1.1.0に両画像共通のextent（基本はhead_shoulders）と画像ごとのtruncatedを追加。旧1.0.0の部位は推測せず保持し、再保存時に本人が確認する。評価者IDは^r[0-9]{2,}$へ統一。外側の比較1.7.0・解析dataset1.5.0は維持する。詳細はSUBJECT-REGIONS.md。

2026-10-13：保存した自分の選択・理由から最大6組の評価メモを作り、次の有料画像生成へ参考情報として加える。同じ案件が初期設定、全案件の利用・個別除外・無効化も選べる。メモの確認は無料で、生成と同じ1回の画像編集へ送る。モデルの重みと採点値は更新しない。任意のfeedback / feedbackAppliedをOpenAPIへ追加し、生成0.6.0、メモありの比較1.8.0・解析dataset1.6.0。旧形式と組IDを維持する。[使い方・契約・限界](GENERATION-FEEDBACK.md)。

2026-10-13：任意のimages[].subjectRegionsを比較1.7.0と解析dataset1.5.0へ追加する。元写真・完成PNGの同じ主役を手動で囲み、ハッシュ・画素座標・記録者・時刻を残す。HTTP API、Candidate/Assessment、画像資産1.0.0と採点値は変更しない。静的配信に/subject-regions.jsを追加。記録形式は相互レビュー対象。[座標と更新・解除の定義](SUBJECT-REGIONS.md)。

2026-10-12：共有ZIPのブラウザ直接読み込み、案件別の履歴（全体60枚・案件24枚・組12枚、重複を除いた192MiB）、元写真を含む下書きZIP、PNG/JPEG保存、生成試行の履歴、完成PNGからの修正、動画の場面取り出し、起動診断を追加。案件名・修正参照・7枚以上の組は比較1.6.0、拡張reportは1.1.0、解析datasetは新しいメタデータがあれば1.4.0。旧形式と固定入力の組IDは維持する。詳細は[写真エディターの作業手順](EDITOR-WORKFLOW.md)。

正本は `shared/openapi.json`。破壊的変更は2人で合意してから行い、呼び出し側とfixtureを同じPRで更新します。

共有ZIPはブラウザ内で作成し、新しいHTTP API・OpenAPIスキーマ・生成/採点版を追加しません。`private-comparison-transfer-1.0.0`のmanifestとPNG資産を同梱し、Nodeで元の比較JSONをSHA-256検証付きで復元します。既存のcomplete-comparison各版を保持し、転送用の参照JSONはAPI入力には使いません。詳細はdocs/COMPLETE-COMPARISON.md。受け渡し方法は採点担当のレビュー対象です。

完成PNG比較用の`/complete-gallery.js`・`/complete-gallery-model.js`・`/complete-gallery-store.js`は静的配信ルートです。画像と人の選択はブラウザ内に保存し、Candidate/Assessmentを変更しません。画像付きの非公開JSONは、自動見出しやデザイン指定を含む場合`complete-comparison-1.3.0`（未採点）、全組の集計付きJSONは`complete-comparison-report-1.0.0`で、画像資産APIとは別形式です。旧1.0.0〜1.2.0も読み込み可能です。実費と保存結果は人が確認して入力し、未確認はnull/unknown。採点側への正式取り込みは形式レビュー待ちです。詳細はdocs/COMPLETE-COMPARISON.md。

Day5の `/review`・`/review.js`・`/comparison-model.js`・`/comparison-store.js` は静的な比較画面とブラウザ保存のための配信ルートです。画像・人の評価はIndexedDBに保存し、この画面からAPIへ送信しません。Candidate/Assessmentの契約は変更しません。採点担当のCSV書き出し・ローカル分析はdocs/DAY5.mdを参照してください。

完成PNGの比較JSONは、各組または全組reportを`/editor`から読み込めます。SHA-256と固定した入力・画像の参照を再検証し、最大60画像・保存済みとの重複を除いた合計192MiBの暫定上限内で一括保存します。JSONファイルは70MiBまで。読み込みはブラウザ内だけで、新しいHTTP APIやCandidate/Assessmentの変更はありません。補足なしの比較JSONはcomplete-comparison-1.5.0、補足ありでイメージを指定したものは1.4.0です。旧1.0.0〜1.4.0も読めます。人の記録・利用確認・実費は保存された申告として復元し、新しい評価や許諾確認として扱いません。書き出し形式の版も維持します。

写真の `/api/v1/complete-thumbnail` は任意の `composition`・`headlineMode`・`design` を受け付けます。生成版はai-complete-0.7.0。briefを任意にし、自動見出しモードなら写真と動画タイトルだけで生成できる。APIの見出しモード省略時は従来のmanualを維持する。既存の見出し指定入力はそのまま使え、Candidate/Assessmentには影響しません。完成PNGは未採点、1回1枚、手動同意・期限・起動内回数制限は維持します。この共有入力と書き出し形式の追加は相互レビュー対象です。人工fixtureはdocs/fixtures/complete-generation-options.json、OpenAPIとの照合テストはtests/complete-generation-contract.test.mjsです。

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

写真1枚からAIが文字と構図まで仕上げる。title（1〜120文字）、imageDataUrl（1280×720 PNG、3MB以内）、consent:true が必須。briefは任意の文字列（0〜1000文字）で、省略・空文字・空白だけの場合は空文字へ正規化する。autoなら写真とタイトルだけで使える。入力JSON上限28MiB。1536×864 PNG1枚と生成版・未評価事項を返す。Candidate/Assessmentは返さず採点pipelineを通さない。画像はサーバーで保存せずOpenAIへ送信する。文字・人物保持と品質の目視確認が必要。

- brief: 動画内容の任意の補足。未入力の内容・活動・結果などを推測して書き足さない。補足なしの比較JSONではbrief:""を固定し、書き出しは1.5.0、分析datasetは1.3.0。従来の補足ありの入力と組IDは維持する。
- headlineMode: manual / auto。APIで省略するとmanual（既存の呼び出しとの互換）。画面の初期値はauto。
- manualではheadline（1〜80文字、改行可）が必須。指定した文言を描画するよう指示する。
- autoではheadlineを省略・null・空文字のいずれかにする。動画タイトルと任意の内容補足から短い見出しを画像生成中に選ぶ。実際の文言はレスポンスで取得せず、画像で確認する。文字起こしや生成前の文言プレビューは行わない。
- design: auto / photo_focus / editorial / impact / recompose。recomposeは元写真の素材から構成を作り直す実験的な方式。省略時auto。写真全面＋下部のサンセリフ、上部のセリフ／明朝、横の細長い太字見出し、の方向を指定する。特定のdesignを固定すると同じレシピを繰り返す。autoはそのままAPIへ送り、写真の主役・余白・動画内容から画像モデルが字体・大きさ・配置を判断する。3つの手動レシピだけに限定せず、履歴による順番切り替えは行わない。同じ写真・内容では似た構成になる場合もある。保存するdesign=autoは希望で、モデルが使った実字体・位置・判断理由ではない。字体と座標は生成への希望で、実測情報ではない。[定義と確認手順](COMPLETE-DESIGN-RECIPES.md)。
- visualIntent: 任意の文字列、300 Unicodeコードポイント以内。省略・空欄なら動画内容から推測する。雰囲気を希望として伝え、構成・字体・大きさは同じ画像編集APIでAIが選ぶ。明示したdesign/compositionは優先する。イメージを指定した比較は別の組IDに固定し、補足ありでは書き出し1.4.0・分析dataset1.2.0、補足なしでは書き出し1.5.0・分析dataset1.3.0に保存する。空欄では旧組IDと形式を維持する。実フォント・文字座標・選択理由は未取得。[検証しながら増やす手順](STYLE-PATTERN-GROWTH.md)。
- composition: auto / text_left / text_right / text_top。省略時auto。明示した配置はデザインの既定の見出し領域を置き換え、字体は維持する。既定配置と指定配置を同時に送らない。recomposeでは人物・素材の切り抜き移動を許す。ほかのdesignでは写真全体の切り取りと拡縮だけを指示する。
- revision: 任意の修正指示。instruction（1〜300文字）、parentImageId（1〜200文字）、imageDataUrl（1536×864 PNG）が必須。PNG本体は16MiB、data URLは22,369,646文字まで。Base64の文字数だけでなく、復号後のバイト数も確認する。元写真と前の完成PNGを1回の画像編集へ送る。
- 修正成功時だけ、応答にrevision: {parentImageId, parentImageSha256}を追加する。SHA-256は受け取った前のPNG本体からサーバーが計算する。APIは保存庫の元画像を参照しないため、この応答だけで修正元との照合完了とは扱わない。通常生成ではrevisionを返さない。生成版はai-complete-0.9.1。

見出しと構図は同じ画像編集API呼び出しで作る。見出し用の追加リクエストは行わず、既存と同じ1回1枚。料金は実際の利用履歴で確認する。構図の違い・人物保持・適切な見出しは新しい指示でも実画像の確認が必要。

モデルgpt-image-2.5-flare、images/edits、medium品質、n=1。画像生成と編集は同じプロセス内の回数・同時実行制限を共有。失敗も1回、自動再試行なし。金額のハード上限ではない。参考: https://developers.openai.com/api/reference/resources/images/methods/edit

serverとOpenAPIの新規経路は相互レビュー対象。採点側ではai_completeを既存候補のように評価しない。

health に completeGeneration（enabled、keyConfigured、busy、calls、maxCalls）を追加。秘密値は返さず、エディターで生成可能な設定と回数上限を表示する。

## POST /api/v1/complete-diagnostics（ローカル・無料）

image-assets-1.0.0のassetsとimagesを受け取り、image_diagnosticsを返す。PNGを外部APIへ送信せず、有料生成回数も消費しない。assetsは入力写真source_photoと完成画像complete_thumbnailだけで、SHA-256・寸法・バイト数・PNG data URLを持つ。imagesは資産を参照する。文字なし背景はnull、生成時の見出しは指示として保持し、renderedTextVerified:false・textRegions:nullとする。

最大4資産、1PNG16MiB、合計32MiB、JSON45MiB、各辺4096pxまで。全資産が参照されること、役割・バイト数・SHA-256・base64形式を検証する。入力不正は400 INVALID_DIAGNOSTIC_INPUT。破損・未対応PNGや宣言寸法との不一致は200のstatus:unavailableと理由で返す。PNG展開の上限・CRC・IENDを確認し、同じhashは1回だけ展開する。

診断版complete-png-diagnostics-0.1.1は採点担当のPNG読み込み（PR #6、8e1aa70）を使う。圧縮・フィルタ方式、未知の必須チャンク、チャンク順序、PLTE/tRNSの整合、1辺の上限はpng.mjsが検証する。生成側のsupportedEncoding事前チェックは削除し、資産の宣言寸法と実寸法の照合を維持する。グレー/RGBの有効なtRNSは指定色を透明として解析する。従来の有効な不透明PNGでは輝度統計は変わらない。Candidate/Assessmentは変更しない。

比較1.6.0と解析dataset1.4.0の任意revisionChecksは照合結果を記録する。imageId、parentImageId、parentImageSha256、scope、status、reasonを持つ。statusはverifiedまたはunverified。scope=comparison_bundleはその比較組内、scope=analysis_datasetは解析へ取り込んだ全画像で照合する。修正元が無い場合はunverifiedと「修正元は未確認」を記録する。元画像を後から追加した場合は再計算する。存在する元画像のハッシュ不一致・自分自身への参照は拒否する。取り込みファイルが宣言した照合結果は信頼せず再計算し、保存庫の固定画像情報を変更しない。

結果は実寸法、sRGBと仮定した相対輝度の間引き統計、ほぼ単色の兆候だけ。色プロファイル変換はしない。assessment、qualityScore、renderedTextはnullで、文字・読みやすさ・収まり・文字コントラスト・人物保持・構図品質をunevaluatedに明示する。Candidate/Assessmentのkind・指標・重みは変えない。入力写真を文字なし背景として扱わない。

OpenAPIのCompleteDiagnosticRequest/Response、人工例docs/fixtures/complete-diagnostics.json、受け渡し手順docs/COMPLETE-PNG-ANALYSIS.mdを参照。共有APIの追加と画像資産の仕様は相互レビュー対象。


修正生成の任意revisionと本文上限28MiBをOpenAPIへ追加。instructionは300文字以内、親の内部画像IDと1536×864の前の完成PNGを受け取り、元写真と合わせて1回の画像編集に送る。モデル・quality・枚数は維持する。新しい静的ファイル5つをserverの配信許可リストへ追加する。共有API、比較の新しい版、保存庫の移行、package.jsonの起動コマンドは相互レビュー対象。依存パッケージの追加はない。Candidate/Assessmentと画像資産の診断契約は変更しない。


任意のfeedbackはGenerationFeedback形式（generation-feedback-1.0.0）。生成に使う過去の理由・分類と画像参照を最大6組受け取り、指定時のみfeedbackAppliedへ正規化した内容を返す。echoは反映の検証結果ではない。APIは過去の画像を持たず、参照は由来の記録として扱う。現在の指示・写真保持条件を優先し、追加のAI呼び出しは行わない。保存時のfeedbackContextは画像の固定情報で、応答のechoと一致が必要。旧サーバーのecho省略も許容する。共有APIと書き出し形式の追加は相互レビュー対象。詳細は[生成の評価メモ](GENERATION-FEEDBACK.md)。

## 生成0.7.0：見出しと構成の編集指示

入力・応答スキーマ、モデル、品質、サイズ、1回1枚は維持する。autoの見出しはタイトルと任意briefに根拠のある見どころを一つ残し、タイトルの言語を基本にする。autoの構成では定番の字体・中心の句の強弱・写真内の空き領域を具体的に指示する。実文言・字体・位置は未抽出、完成PNGは未採点で、改善の実画像確認は未完。[詳細](THUMBNAIL-EDITORIAL-GUIDE.md)。sharedのauto指示とOpenAPIの説明は相互レビュー対象。
# 参考サムネイルの追加（OpenAPI 0.3.8 / 生成0.10.0）

完成PNG生成とA入力固定に任意の referenceMode（auto / off）を追加しました。API省略時は従来動作、エディター既定はautoです。最大5件の観察記録と、明示した許諾根拠のある参考画像だけを同じ画像編集へ加えます。応答のreferenceContextは送信候補で、モデルが採用した型や品質評価ではありません。Candidate / Assessment・採点・重みは変更しません。

無料のローカルAPI：GET /api/v1/reference-library、GET /api/v1/reference-library/thumbnail/{videoId}、POST /api/v1/reference-library/collect（空オブジェクト）、POST /api/v1/reference-library/observe、POST /api/v1/reference-library/preview。詳細・制限・共有形式・相互レビュー範囲は [参考ライブラリ仕様](RECENT-THUMBNAIL-LIBRARY.md) と shared/openapi.json を参照してください。収集と候補確認ではOpenAI APIを呼びません。
