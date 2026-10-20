# 最近の参考サムネイル

生成 0.10.0 / OpenAPI 0.3.8。実際の公開動画の字体・配置・素材の関係を観察して記録し、完成PNGの同じ画像編集1回へ参考情報を加えます。モデルの重みの学習、CTR予測、人気順の品質採点ではありません。生成結果の改善は別途確認が必要です。

## 収集と観察

- 公開日は確認時から6暦月以内、再生数は厳密に1,000,000回より多い動画。日付・再生数・確認日時を YouTube Data API v3 で照合します。
- 4分以上、ライブと配信アーカイブを除外。同一チャンネルは最大5本、目標100本です。4分という条件は短尺を避ける近似で、全ての通常動画を含むわけではありません。
- 日本・日本語の検索設定を使いますが、これは優先条件です。日本語だけ、世界上位100本、ジャンル全体の代表標本とは説明しません。
- 12分野を順番に検索します。1回最大24検索。既存の動画情報も再取得し、条件を外れた動画を落とします。失敗時は既存台帳を保持し、閾値を緩めたり人工データで100件を埋めたりしません。
- メタデータ確認済みと、実画像を開いて観察済みを分けます。観察ではジャンル、雰囲気、scene / cutout / multi_photo / illustration、字体、配置、適用条件、避ける条件を記録します。observer は human / assistant を区別します。assistant の記録は人の好みや品質評価ではありません。
- 同じ画像が別動画で使われる場合があります。生成時は画像ハッシュとチャンネルで重複を除きます。

## キーとローカル保存

Google Cloud でプロジェクトを選び YouTube Data API v3 を有効化し、APIキーを作ります。PC内サーバーの検証用では API制限を YouTube Data API v3 のみにし、HTTPリファラー制限は使いません。公開データの取得にOAuthログインは使いません。請求の案内が出た場合は、その画面の内容を確認してください。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/set-youtube-key.ps1
npm run references:check
npm run references:collect
npm run references:cache
```

キーは非表示の入力でローカル .env の YOUTUBE_API_KEY に保存し、既存の OpenAI 設定を保ちます。チャットやGitへ貼りません。ブラウザには設定済みかの真偽値だけ返します。キーはYouTubeへのヘッダーで送り、URLやエラー本文へ出しません。

台帳と画像は data/private/recent-thumbnail-library/ に保存し、Gitへ追加しません。画像は許可したYouTubeのHTTPSサムネイルURLのみ、リダイレクトなし、PNG/JPEG、2MiBまで。ハッシュ名のファイルで保存します。動画本体はダウンロードしません。

APIメタデータと画像キャッシュの30日をそれぞれ確認し、期限切れのものは次の台帳アクセス時に削除します。孤立した画像も30日後に削除します。更新前の情報を再利用しません。観察記録は画像ハッシュに結び、画像が変わったら観察記録と画像送信許可を解除します。複数プロセスの台帳書き込みはロックで直列化します。異常終了後に catalog.lock が残った場合、処理が動いていないことを確認して復旧してください。

## 生成への接続

エディターの「参考サムネイル」は既定で自動、APIで referenceMode を省略した場合は従来どおり追加なしです。オフも選べます。「今回の参考候補を確認」は無料で、写真もOpenAIへ送りません。

コードはタイトル・動画補足・希望する雰囲気のタグと、素材の種類から最大5件に絞ります。コードは入力写真を分析していません。画像モデルが実際の写真・見出し・人物の位置に合うかを同じ画像編集で判断します。合わない候補は採用しなくて構いません。

通常の自動デザインには scene、再構成には cutout を使います。手動デザイン・手動配置・既存画像の修正には競合する参考を追加しません。条件に合う観察がない場合は追加せず、その理由を応答に残します。再構成の切り抜き・再配置の指示は参考より優先します。

通常送るのは汎用的な観察文です。実画像の送信は generationAllowed=true と許諾根拠を明示して保存した参考だけです。収集したことや再生数は画像送信の許諾にしません。入力の1枚目が人物・物・風景の唯一の素材です。参考の人物、ロゴ、文言、風景をコピーさせません。

モデル・medium・1536×864・n=1 は変えず、追加の言語モデルや画像解析APIは呼びません。実画像が許可された場合は最大5枚、入力写真と合わせ最大6枚です。画像入力や文章量が増えるため実費が同じとは保証せず、不明な料金を推定値で埋めません。

応答の referenceContext は送った候補の動画ID、画像・観察のSHA-256、実画像の送信有無、台帳ハッシュです。モデルが選んだ型、実際に反映した証明、品質の点数ではありません。再生数・公開日を長期保存する生成履歴へコピーしません。

## 検証・共有・担当間の影響

- Aの固定入力に referenceMode、固定した生成条件に referenceContext を含めます。送信許可済み実画像を実際に使う場合、その画像もAのZIPへ同梱しハッシュを照合します。参考やコードが変わった固定IDは生成前に停止します。過去のA固定記録は書き換えません。
- 比較JSONは参考記録がある場合のみ complete-comparison-1.9.0、解析データは complete-evaluation-dataset-1.8.0 になります。古い比較・下書き・共有ZIPも読み込みできます。下書き移行でも設定・応答・Aの参考画像を保持します。
- 共有API、server、生成、フロント、固定検証の変更です。Candidate / Assessment、採点値、重み、並び順、採点側実装、依存パッケージは変更しません。相互レビューでは参考の来歴と採点の分離、固定条件、旧データの往復を確認してください。
- 公開fixtureとテストは人工データのみ。収集した実例・元写真・評価メモ・キーをコミットしません。有料の生成品質検証は人が行い、「候補を送った」と「実際に採用された」を区別します。

## 参照した仕様

- [YouTube search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list)
- [YouTube videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list)
- [YouTube APIの登録](https://developers.google.com/youtube/registering_an_application)
- [YouTube開発者ポリシー](https://developers.google.com/youtube/terms/developer-policies)
- [OpenAI画像編集](https://developers.openai.com/api/reference/python/resources/images/methods/edit)
