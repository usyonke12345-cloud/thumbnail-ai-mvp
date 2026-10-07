# Day 2 — 画像生成adapter

## 実装済み

- `GENERATION_PROVIDER=mock / openai` で切り替え。
- OpenAI Images APIをサーバーだけから呼び出す。既定モデルは `gpt-image-2.5-flare`。
- 1回の操作につき背景1枚（1536×1024、low、PNG）を生成し、1280×720のSVGへ埋め込む。
- 同じ背景から3つの文字・配色案を作る。異なる背景を3枚生成する方式ではない。
- 文字はSVGで合成し、採点対象の文字領域は不透明パネルで固定。実画像の内容は未評価。
- 外部応答エラー、キー不足、タイムアウト、同時生成、起動中の回数制限を処理。
- 自動リトライなし。同時API呼び出し1件、起動中10回が既定。失敗した送信も回数に含む。

## 実画像を試す

1. `.env.example` を `.env` にコピー。
2. `.env` だけにAPIキーを入力し、以下を設定。

```dotenv
GENERATION_PROVIDER=openai
OPENAI_API_KEY=ここに自分のキーを入力
OPENAI_IMAGE_ENABLED=true
OPENAI_MAX_CALLS=1
OPENAI_TIMEOUT_MS=120000
```

3. 既存サーバーを止め、プロジェクトフォルダで以下を実行。

```sh
node --env-file=.env backend/server.mjs
```

4. 画面を更新し「AI背景生成モード」を確認。「3案を作る」で有料APIを1回呼び出す。
5. 生成結果、文字切れ、背景の意味、所要時間、OpenAIの利用履歴に出た実費を記録する。

キーはチャット・GitHub・PRへ貼らない。`.env` はGit除外、HTTPから配信されない。
mockに戻す場合は `npm start` で再起動（OSの環境変数にproviderを設定している場合はそちらも戻す）。
ChatGPTの契約とは別にAPIアカウントの利用可能な残高・権限が必要。

## 費用制限の意味

1回1枚・low品質・短いプロンプト・起動中の回数制限で呼び出し量を制限する。
金額のハード上限は実装していない。生成開始後のタイムアウトでも課金される可能性があり、再起動で回数カウンタはリセットされる。
実費は利用履歴で確認する。最初はMAX_CALLS=1で試す。

## 相手へのレビュー事項

- modeに `ai_background` を追加。候補と評価のフィールドは既存のまま。
- 採点は文字パネルの配色・文字数・文字サイズのみ。画像内容やCTRは未評価。
- server/pipelineとOpenAPIの変更を含むため、PRで共同レビューしてからmainにマージ。
- PNG/JPEG書き出しとフォント固定はDay 3。現時点の保存形式はSVG。

## 検証状態

通信は人工応答でテスト。実APIで背景1枚から3案の生成に成功。全体9,649ms、利用履歴の表示額0.01米ドルをユーザーが確認。複数回の成功率・品質評価は未実施。
相手側のB2（検証データ作成）は相手のブランチで進める。

公式仕様: [Images API](https://developers.openai.com/api/reference/resources/images/methods/generate)、[画像生成ガイド](https://developers.openai.com/api/docs/guides/image-generation)。

