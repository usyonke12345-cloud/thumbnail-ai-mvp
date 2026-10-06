# 評価データ（B担当: Claude / Day 1 方針）

初期fixtureは人工的なタイトルだけです。学習データやCTRデータはありません。
**ここでの選好は人の好みの記録であり、クリック率（CTR）ではありません。** 公開動画の再生数だけからサムネの因果効果を推定しないでください。

## Gitに入れるもの・入れないもの
| 場所 | 内容 | Git |
|---|---|---|
| `data/fixtures/` | 人工タイトル・採点テスト用ケース | 入れる |
| `data/schema/` | 記録項目の定義 | 入れる |
| `data/templates/` | 空の記録表（見出しのみ） | 入れる |
| `data/private/` | 実タイトル・画像・評価結果・許諾の記録 | **入れない**（.gitignore済み） |

画像、個人名、メールアドレス、チャンネルの非公開情報、APIキー、`.env` は、どのフォルダでもコミットしません。

## 記録項目（`data/schema/sample.schema.json`）
`sample_id`, `title`, `genre`, `source`, `source_url`, `permission`, `permission_date`, `candidate_id`,
`generation_version`, `scoring_version`, `reviewer_id`, `preferred_candidate`, `ranking`, `reason`, `split`

- `permission`: `own_work`（自作・自分で用意）／`owner_consented`（所有者が記録に同意）／`none`。**`none` の行は評価に使いません。**
- `reviewer_id`: `r01` のような仮名。本名は書きません。
- `candidate_id`: 比較した3案の組（生成の1回分）のID。`preferred_candidate`: 3案から選んだ案のstyle（`bold` / `contrast` / `clean`）。`ranking` は任意で `bold>clean>contrast` の形式。
- `generation_version` / `scoring_version`: 採点時の版を必ず記録し、再評価できるようにする。
- `split`: `dev` か `holdout`。`sample_id` のハッシュで自動決定（`data/validate.mjs` の `splitFor`）。
  holdout（約30%）は重みの調整に使わず、最後の順位一致率の確認だけに使います。

## 運用ルール
1. サンプルは `data/templates/preferences.template.csv` を `data/private/` にコピーして記録する。
2. タイトルを集める前に、所有者へ用途（社内評価のみ・公開しない）を伝えて許諾を得る。
3. 20件程度の少数なので、順位一致率は「参考値」と書く。有意な結論として扱わない。
4. 評価スコアは「レイアウトの仮説的な指標」と表記し、CTR予測・効果保証と書かない。

## B2の進め方（許諾済みタイトル20件）
1. `data/templates/preferences.template.csv` を `data/private/preferences.csv` にコピーする。
2. タイトルごとに3案を生成し、評価者が好みを選んで1行ずつ記録する（`scoring_version` は画面のversionを写す）。
3. `node data/validate.mjs data/private/preferences.csv` で検証する。出力は件数と不正行の番号だけで、タイトルは表示しない。
4. `permission` が `none` の行や、`split` が `sample_id` と合わない行は不正行として報告される。
