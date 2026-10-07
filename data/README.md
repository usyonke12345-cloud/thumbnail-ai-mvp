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
5. 出力の `progress` は、不正行のない実サンプル数と目標20件を示す。`source` が `synthetic` の行は数えない。20件未満なら `status: 未完`。

Excelで保存したCSV（先頭にBOMが付く）もそのまま検証できる。

### 許諾確認チェックリスト（1タイトルごと、記録前に人が確認）
- [ ] 出典（`source`）を特定した。公開URLがあれば `source_url` に書いた。
- [ ] 所有者本人、または所有者から同意を得た人が、用途（チーム内の選好評価のみ・公開しない・CTR推定に使わない）を理解して許諾した。
- [ ] 許諾の日付を `permission_date` に書いた。許諾のやり取り（相手の連絡先など）は `data/private/` 以外に残していない。
- [ ] `permission` は `own_work` か `owner_consented`。確認できないものは `none` にして評価に使わない。
- [ ] 評価者は `r01` などの仮名で記録した。

### 収集状況
| 日付 | 許諾済みの実サンプル | 状態 |
|---|---|---|
| 2026-10-07 | 0 / 20 | **未完**（まだ収集していない。人工データで埋めない） |

件数は `node data/validate.mjs data/private/preferences.csv` の `progress.usable` を転記する。タイトルはここに書かない。

## 縮小表示テスト（48 / 60 / 76px）
`font` の基準（現在の「48px以上で満点」は**検証前の仮値**）を見直すための、読みやすさの確認です。20件の選好評価とは別に扱います。
- 使う画像は**無料の人工画像だけ**（`source` は `synthetic` のみ受け付ける）。実タイトル・実画像は入れない。
- 同じ人工タイトルを文字サイズだけ変えた画像の組（`image_set_id`）を作り、表示幅（仮に 168 / 246 / 360px）に縮小して評価者に見せる。
- 1行＝1人が1枚を見た結果。`read_correct`（yes/no）、`seconds`（任意）、`rank`（同じ評価者・組・表示幅の中の読みやすさの順位、1が最良）を記録する。

1. `data/templates/readability.template.csv` を `data/private/readability.csv` にコピーして記録する。
2. `node data/readability.mjs data/private/readability.csv` で検証・集計する。文字サイズ×表示幅ごとに、件数・正答率・秒数の中央値・平均順位・縮小後の文字の高さ（`scaled_px` ＝ 文字サイズ × 表示幅 ÷ 1280）を出す。
3. 同じ評価者・組・表示幅の中で、順位や文字サイズが重なる行は不正行として報告される。

評価者が少人数なので結果は参考値とし、これだけで重みや閾値を決めない。
