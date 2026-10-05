# ChatGPT × Claude の並行開発

AI同士が履歴を共有する必要はありません。GitにあるREADME、契約、タスク、テストを共通の文脈にします。
`AGENTS.md` は共通ルール、`CLAUDE.md` は相手が同じルールを読む入口です。

## 毎日の流れ

1. mainを更新し、タスクごとのブランチを作る。あなたは `feature/generation-provider`、相手は `feature/scoring-baseline`。
2. 触るフォルダと契約変更の有無をIssueまたはチャットに記す。
3. 小さく実装して `npm test`。PRに変更理由・動作確認・未完事項を書く。
4. 相手がレビューしてmainにマージ。次の作業は最新mainから開始。

```sh
git switch main
git pull --ff-only
git switch -c feature/scoring-baseline
# 実装後
npm test
git add backend/scoring tests
git commit -m "Add image scoring baseline"
git push -u origin feature/scoring-baseline
```

コミット対象は変更内容に応じて選びます。同じブランチへの同時pushとmainへの直接pushを避けます。
GitHub設定でmainにPR必須・相手1人の承認・CI成功を設定することを推奨します。これらはまだリモートで設定していません。
CODEOWNERSはユーザー名未確定のため未設定です。2人のGitHub名が決まったら担当表に従って追加します。

## 競合と契約変更

shared、package.json、server、pipelineの変更は先に合意。契約追加→利用側対応→旧項目廃止の順にします。
競合時は双方の意図を確認し、片方の変更を一括上書きせず、解決後に接続テストを実行します。
履歴の強制pushは必要な場合のみ本人の作業ブランチで `--force-with-lease`。共有mainには使用しません。

## あなたのAIに渡す初回指示

「README.md、AGENTS.md、shared/openapi.json、docs/API.md、docs/WEEK1.mdを読み、A2を実装してください。担当はfrontendとbackend/generationです。実画像APIの選定理由・設定方法・費用制限・エラー処理を含め、API契約の変更は提案を先に示してください。APIキーはコードに書かず、評価モジュールは変更しないでください。」

## 相手のClaudeに渡す初回指示

「README.md、CLAUDE.md、AGENTS.md、shared/openapi.json、docs/API.md、docs/WEEK1.mdを読み、B1から着手してください。担当はbackend/scoringとdataです。fixtureで独立実装し、生成側のファイルは変更しないでください。スコアはCTR予測と表示せず、評価根拠・限界・バージョンを返してください。npm testで接続互換性を確認してください。」
