# サムネ工房 — 2人開発スターター

YouTube向けサムネイル生成・評価AIのMVPを、2人が並行して実装するためのリポジトリです。
標準起動は、タイトル入力 → SVGレイアウト3案 → 仮の採点 → 保存の無料ローカルデモです。
Day 2ではOpenAI画像生成adapterを追加しました。設定するとAI背景1枚から3案を作れます。実APIの検証はキー設定後に行います。
画像認識、CTR予測、YouTubeへの投稿は未実装です。ジャンルはAI生成プロンプトに含めますが、採点には使いません。

## 起動

Node.js 22以上とGitを用意します。追加パッケージ、APIキー、課金は不要です。
このREADMEがあるフォルダで実行してください。

```sh
npm start
```

ブラウザで http://127.0.0.1:3000 を開きます。終了は Ctrl+C。

```sh
npm test
```

設定を変える場合は `.env.example` を `.env` にコピーし、`node --env-file=.env backend/server.mjs` で起動。
通常の `npm start` は `.env` を自動読み込みしません。`GENERATION_PROVIDER` は `mock` と `openai` に対応。
有料の実画像生成は [Day 2の設定手順](docs/DAY2.md) を参照してください。キー入力に加え、明示的な有効化が必要です。
保存したSVGはレイアウト確認用です。実際のYouTube用PNG/JPEG書き出しは1週間のタスクに含めています。

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
