# サムネ工房 — 2人開発スターター

YouTube向けサムネイル生成・評価AIのMVPを、2人が並行して実装するためのリポジトリです。
標準起動は、タイトル入力 → SVGレイアウト3案 → 仮の採点 → 保存の無料ローカルデモです。
Day 2ではOpenAI画像生成adapterを追加しました。設定するとAI背景1枚から3案を作れます。実APIの検証はキー設定後に行います。
画像認識、CTR予測、YouTubeへの投稿は未実装です。ジャンルはAI生成プロンプトに含めますが、採点には使いません。

## 起動

Node.js 22以上とGitを用意します。初回に npm ci で依存パッケージを入れます。無料デモはAPIキー・課金不要です。
このREADMEがあるフォルダで実行してください。

```sh
npm ci
npm start
```

ブラウザで http://127.0.0.1:3000 を開きます。終了は Ctrl+C。

```sh
npm test
```

設定を変える場合は `.env.example` を `.env` にコピーし、`node --env-file=.env backend/server.mjs` で起動。
通常の `npm start` は `.env` を自動読み込みしません。`GENERATION_PROVIDER` は `mock` と `openai` に対応。
有料の実画像生成は [Day 2の設定手順](docs/DAY2.md) を参照してください。キー入力に加え、明示的な有効化が必要です。
候補は1280×720のPNG・JPEG・SVGで保存できます。PNG変換では追加のAPI料金はかかりません。

Day5の比較は、3案を作って「この3案を固定保存」→ `/review` で人の選択・出典・許諾・順位・実費・保存結果を記録します。同じ画像を再表示し、20件の進み具合と人の選択との一致を集計します。ブラウザ内保存とJSON/CSV書き出しのみで、記録時のAPI料金はありません。実際の20件の記録は人が行います。手順と採点担当の分析コードへの接続はdocs/DAY5.mdにあります。

## 分担と構成

| 場所 | 担当 | 役割 |
|---|---|---|
| `frontend/` | あなた / ChatGPT | 入力・比較・保存・エラー表示 |
| `backend/generation/` | あなた / ChatGPT | 画像生成プロバイダー・文字合成 |
| `backend/scoring/` | 相手 / Claude | 採点・根拠・評価バージョン |
| `data/` | 相手 / Claude | 許諾済み検証データとラベル |
| `backend/server.mjs`, `pipeline.mjs` | あなた、変更は相手レビュー | APIと生成→評価の接続 |
| `shared/` | 共同レビュー必須 | API契約・入力検証 |
| `tests/`, `.github/`, `docs/` | 共同 | 接続検証・手順・タスク |

画面は素のHTML/CSS/JS、サーバーはNode.jsの標準機能です。最初の接続確認を軽くし、フレームワーク移行は必要になった段階で決めます。
生成と評価は独立したモジュールです。評価担当は画像生成APIキーがなくてもfixtureで開発できます。

採点0.4.0は未評価の項目をnullで返し、総合点の下限・上限、評価範囲、重みを表示します。文字サイズと収まりは別項目です。同じ未評価項目の案だけを点数順に比較します。点数の幅は計算上の暫定範囲で、CTR予測ではありません。契約はdocs/API.mdとshared/openapi.json、契約テストはtests/assessment-contract.test.mjsにあります。

## 読む順番

1. [1週間のタスク](docs/WEEK1.md)
2. [APIとモジュール契約](docs/API.md) / [OpenAPI](shared/openapi.json)
3. [Git運用とAIへの引き継ぎ](docs/COLLABORATION.md)
4. [検証データ](data/README.md)

## 初回のGit共有

公開リポジトリ: https://github.com/usyonke12345-cloud/thumbnail-ai-mvp
新しいPCでは以下で取得できます。

```sh
git clone https://github.com/usyonke12345-cloud/thumbnail-ai-mvp.git
cd thumbnail-ai-mvp
npm test
npm ci
npm start
```

開発を始めるときはサーバーを止めて、担当ブランチを作ります。

```sh
git switch -c feature/generation-provider
```

相手はcloneして `git switch -c feature/scoring-baseline`。詳細はCOLLABORATION.md。
Day 1の実施結果と相手側チェックリストは [DAY1.md](docs/DAY1.md)。

## MVPの完成条件

許諾された入力から1280×720のPNG/JPEGを3案生成し、評価の根拠とともに比較・保存できること。
本物の画像生成APIを接続後、20回の試行で待ち時間・失敗率・費用を測定します。30秒以内は目標で、達成済みの保証ではありません。
認証・課金・履歴DB・独自モデル学習・自動再生成・YouTube投稿は初週の対象外です。
サーバーはローカル開発用で127.0.0.1に限定しています。公開前に認証、利用量制限、画像保管、タイムアウト、秘密情報管理を設計してください。

技術参照: [Node.js HTTP](https://nodejs.org/api/http.html)、[Node.js test runner](https://nodejs.org/api/test.html)。

採点用レイアウト情報の生成側実装と人工fixtureを追加しました。
詳細: [metadataの定義](docs/METADATA-PROPOSAL.md)。寸法は推定で、実フォント測定ではありません。

Day4の復旧・制限設定と参考サムネ分析の準備: [Day4手順](docs/DAY4.md)。

参考サムネの記録はローカル起動後 /references で開けます。記録はブラウザ内保存、JSONでバックアップ可能。

写真エディター /editor の『AIで完成画像1枚を作る』は写真と動画内容・見出しの作成方針をOpenAIへ送り有料生成する実験機能です。見出しは「AIに任せる」が既定で、動画タイトルと内容から画像生成時に短い文言を選びます。「上の見出しをそのまま使う」で手入力にもできます。確認チェックが必要。キーはサーバー側.env、OPENAI_IMAGE_ENABLED=trueが必要。通常編集は無料。完成画像は未採点です。

「デザインの方向」は写真を主役にする・落ち着いた誌面風・文字を大きく見せる、から選べます。おまかせでは同じ入力の保存済み生成履歴を読み、次の方向へ切り替えます。写真の切り取り・文字の雰囲気・配色を写真と動画内容に合わせる指示を加えています。画像生成は1回1枚で、見出し用の追加API呼び出しはありません。実際の文言や構図の変化・品質は完成画像で確認してください。新しい指示の実画像検証は未完です。

実際に作った完成PNGは、同じ入力写真・タイトル・内容・見出し作成方針ごとにブラウザ内へ保存し、小さい表示で見比べられます。自動見出しは文言が変わるため、完成サムネ全体を比較します。選択・全部使わない・理由・確認済み実費・PNG保存結果を記録し、画像付きJSONとPNGを書き出せます。全組の記録と集計もJSONに保存できます。比較操作の追加料金や自動生成はありません。2026-10-09にユーザーがAPI生成画像は使えるレベルだったと確認し、実PNGでの比較を次の対象としました。正式な20件の収集・採点との比較は未完です。[完成PNG比較の手順](docs/COMPLETE-COMPARISON.md)。

完成PNGの寸法・解析可否・明るさを無料で診断し、画像付きJSONを採点担当へ渡す非公開の分析フォルダーにまとめられます。別写真・タイトルの少数確認から20件の比較へ進む手順とコマンドは [完成PNGの分析・受け渡し](docs/COMPLETE-PNG-ANALYSIS.md)。文字や人物保持の自動品質採点は未実装です。

分析フォルダーの`preview.html`を開くと、元写真・完成PNG・人のコメントを並べて確認できます。表示幅の変更は無料で、画像の再生成や比較件数の追加は行いません。
