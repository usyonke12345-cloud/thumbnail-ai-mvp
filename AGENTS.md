# 共通の開発ルール

- README、docs/API.md、shared/openapi.json、docs/WEEK1.mdを読んでから実装する。
- あなた/ChatGPT: frontend、backend/generation。相手/Claude: backend/scoring、data。
- shared、依存関係、server、pipelineを変更する際は契約の影響を明記して相互レビューする。
- APIキー・個人情報・許諾のない画像をGitへ入れない。
- mockはmockと表示する。仮の評価をCTR予測、AI画像解析、効果保証と表現しない。
- 生成と評価は別モジュール。scoringからgenerationをimportしない。
- PR前にnpm test。API契約変更時はOpenAPI・fixture・READMEを合わせて更新。
- 依存パッケージ追加は必要性と導入手順を説明し、lockfileをコミットする。
