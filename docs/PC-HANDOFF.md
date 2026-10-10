# 別のPCで作業を続ける

2026-10-11時点の最新版はfeature/day4-recovery。PR #4はDraftで、mainに入っていない変更を含む。写真からのAPI完成PNG、自動見出し、デザイン3方向、写真と結果のブラウザ保存、比較JSONの読み込み、ローカル診断がある。完成PNGの自動品質点数は未実装。

## 新しいPCでコードを取得する

Node.js 22以上とGitを用意し、保存したいフォルダーで実行する。初回だけcloneする。

```powershell
git clone --branch feature/day4-recovery https://github.com/usyonke12345-cloud/thumbnail-ai-mvp.git
cd thumbnail-ai-mvp
npm ci
npm test
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

ローカルの.envでPORT=3004、GENERATION_PROVIDER=mockと設定する。無料デモはAPIキー不要。写真からの有料生成も使う場合だけ、ローカルの.envにOPENAI_API_KEYを設定してOPENAI_IMAGE_ENABLED=trueにする。OPENAI_MAX_CALLS=1を維持する。キーをGitやチャットへ載せない。

```powershell
node --env-file=.env backend/server.mjs
```

http://127.0.0.1:3004/editor を開く。各PCの127.0.0.1は、そのPC自身のサーバーを指す。元のPCで起動しただけでは、別PCの同じURLから見られない。

Codexで取得したthumbnail-ai-mvpフォルダーを作業用として開き、次の内容を引き継ぐ。

> README.md、AGENTS.md、docs/API.md、docs/DAY5.md、docs/PC-HANDOFF.mdを読み、feature/day4-recoveryの作業を続けてください。生成担当はfrontendとbackend/generationです。採点とdataはパートナー担当です。必要な質問がない限り進め、有料APIは手動同意なしに呼ばないでください。完成PNGは未採点です。自動見出しとデザイン方向の実画像の品質確認、人の20件の比較は未完です。共有契約の変更はPRでレビューできる形にしてください。

## 写真と完成画像・比較記録を移す

1. 元PCの/editorで「全組の画像・記録・集計JSONを保存」を押す。各組JSONでもよい。
2. そのJSONをUSBなどで非公開のまま別PCへコピーする。写真と完成画像が含まれるので公開GitHubに置かない。
3. 別PCの/editorで「保存した写真・完成画像・比較記録を読み込む」からJSONを選ぶ。
4. 写真・完成画像・人のコメント・実費・保存結果を確認する。同じファイルを再度読み込んでも画像や比較組を重複計上しない。

読み込みは無料で、外部APIへ送らず自動生成もしない。人の記録・利用確認・費用は元の申告を履歴として復元する。画像の品質、許諾、保存成功を新しく検証したという意味にはしない。

このJSONにある入力写真はAPIへ送った1280×720の切り取り済みPNG。元の長方形写真ファイル、編集途中の下書きと切り取り設定、APIキーは別途用意する。取り込んだ写真を使い直す場合は「この入力写真を保存」から保存して写真選択で読み込む。必要なタイトルと動画内容は比較組の説明に表示される。新しい編集条件は別の入力として記録されることがある。

履歴はブラウザ内に保存する。同じPCでもブラウザ・ホスト名・ポートが異なると保存場所は別なので、今後も同じhttp://127.0.0.1:3004を使う。容量上限は6画像・写真と完成PNGのdata URL合計64MiB、JSONのファイル上限は70MiB。容量が足りない場合は必要なJSON/PNGを保存してから不要な組を削除する。

## PCを切り替えるとき

作業元で変更をコミットしてpushし、移動先で以下を実行する。未コミット変更がある場合は先に整理し、上書きやforce pushで解消しない。同じブランチを2台で同時に編集し続けない。

```powershell
git status --short
git pull --ff-only origin feature/day4-recovery
npm ci
npm test
```

コードはGitHub、個人の写真と記録は非公開のバックアップで引き継ぐ。移行のために新しい有料画像を生成する必要はない。
