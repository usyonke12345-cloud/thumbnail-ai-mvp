# PNG画像資産と完成画像評価の提案（採点担当の確認待ち）

## 進める方針

主な生成方式になった写真からの完成PNGも、実画像の分析対象にする。まず寸法・破損・全体/領域の明るさなど診断情報を返す土台を作り、その後、文字の検出・実際の見出しとの一致・主役の保持を扱う。診断情報だけで「使える」「CTRが高い」と採点しない。採点担当PR #6のPNG基盤を使う方向で、共有入力は合意後に実装する。

## 生成方式による違い

- 背景を作って文字を合成するSVG方式：文字を重ねる前の背景PNGを持っている。
- 写真の画像編集APIで完成PNGを一度に作る方式：入力写真と完成PNGを持っている。文字を重ねる前の背景は存在しない。入力写真は完成画像の背景として代用しない。モデルは位置や光などを変えるため、画素の対応も保証できない。

完成PNGの文字の背面コントラストは、完成画像を背景と見なして測らない。文字領域・実際の文字色などが未取得の間は未評価を維持する。将来、OCRや人の指定で文字を検出する場合も、周囲の画素からの推定を実測の背面色と混同しない。

## 画像資産の案：image-assets-1.0.0

生成画像をバイナリで保存した際にSHA-256と寸法を記録し、同じPNGは共有する。評価リクエスト内ではassetIdで参照し、画像本体はassetsに1回だけ持つ。現在のAPI・保存形式にはまだ導入していない。

```json
{
  "assetVersion": "image-assets-1.0.0",
  "assets": [{
    "assetId": "asset-complete-01",
    "sha256": "<PNGバイトのSHA-256、64桁の16進数>",
    "mimeType": "image/png",
    "width": 1536,
    "height": 864,
    "byteLength": 123456,
    "dataUrl": "data:image/png;base64,<PNG本体>"
  }],
  "image": {
    "assetId": "asset-complete-01",
    "role": "complete_thumbnail",
    "generationVersion": "ai-complete-0.1.2",
    "sourcePhotoAssetId": "asset-source-01",
    "backgroundAssetId": null,
    "headlineProvided": "FIND YOUR PERFECT HAIRSTYLE",
    "renderedTextVerified": false,
    "textRegions": null
  }
}
```

上は形を示す抜粋で、asset-source-01の本体も送る場合はassetsへ追加する。roleはsource_photo / background_before_text / complete_thumbnailを明示。backgroundAssetIdは実際の文字なし背景があるときだけ指定する。headlineProvidedは生成指示であり、画像に正しく描かれた文字として扱わない。textRegionsは実測/推定/unknownを区別し、未取得ならnull。

## 保存・展開

- 保存先は非公開のブラウザIndexedDBまたはdata/private/images/。Gitには画像を入れず、外部の画像URL・PCの絶対パスを共有APIへ入れない。
- PNG本体は1画像16MB以下、4096×4096以下、1リクエストの圧縮バイト合計32MB以下、最大4資産を暫定上限にする。実装時は寸法宣言を実デコード結果と照合する。
- SHA-256は受信したPNGバイトから計算し、宣言と照合する。評価リクエスト単位のMapで同じhashを一度だけ展開する。異なるhashを同じassetIdへ置き換えない。リクエスト終了で解放する。
- IHDRから行長と展開後バイト数を計算し、inflateSyncのmaxOutputLengthで展開前に上限をかける。入力バイト・展開サイズ・デコードRGBAのメモリ上限を別々に持つ。余分な展開データ、途中切れ、必須チャンク不足は未評価へ返す。
- 検証とキャッシュは全候補で共有する。decode失敗時は推測の点数を出さず、理由を返す。

## 最初に返す診断の範囲

完成PNGについて、実寸法・形式の確認と輝度統計、ほぼ単色という兆候を診断情報として返す。ほぼ単色を自動的に低品質と判定しない。未取得の文字範囲・文字色・主役保持を未評価と明記する。現行Assessmentのlayout_heuristicをそのまま完成PNGの品質スコアとして表示しない。

## 相手に確認してほしいこと

1. 完成PNGは背景なしで全体の診断から開始する方針。
2. 画像資産のrole・hash共有・上限と、文字情報が未取得ならnullにする方針。
3. PR #6のdecodePngへ展開サイズ上限と余分な生データの拒否、必須IENDの検証を追加する。regionStatsのstepも正の有限整数として検証する（0や負数を受け付けない）。

## PR #6の統合確認（2026-10-09）

生成側4528fedと採点側PR #6の3acbf32を一時的に合流して確認。npm testは120件成功、スキップなし。PR #6は確認後に合流を取り消し、この生成側ブランチには含めていない。生成側単独は111件成功。

decodePngの追加確認にはCRCが正しい小さい人工PNGを使用した。1×1のRGBA画像の展開データは5バイトであるべきだが、65,536バイトを渡しても成功した。また、正しい5バイトのデータでもIENDのないPNGを成功として返した。必須IENDの確認と展開サイズの一致・上限を、APIへ接続する前に採点側で直してほしい。巨大データは試していない。

regionStatsではstep=0/負数の検証がなく、ループを終了できないため、コード上の確認だけを行った。stepの正の有限整数検証も採点側への依頼。現在この基盤は共有APIへ接続されていない。

2026-10-10、ユーザーから完成PNGの受け渡しと分析の接続を依頼されたため、Draft PRでレビューできるローカル診断APIを追加した。従来のAssessment.kindは変更しない。正式な画像資産・共有APIの合意とmainへのマージは引き続き相互レビュー対象。文字の読みやすさや完成画像の品質を測る方法は、この土台とは別に検証する。

## 接続実装（2026-10-10）

採点側076bc4dで展開サイズ制限、IEND、余分なデータ、step検証が修正されたことを確認し、生成側へ統合した。backend/analysis/complete-png.mjsからこのPNG解析を呼び、画像資産image-assets-1.0.0を追加のPOST /api/v1/complete-diagnosticsで受け取る。source_photoとcomplete_thumbnailを扱い、backgroundAssetId、textRegions、renderedTextはnull。OCRや文字検出をしたことにはしない。最大4資産・合計32MiB・JSON45MiBとし、SHA-256・バイト数・役割・全参照を確認する。

共有hashの統計だけをキャッシュし、RGBAは保持しない。RGB/グレースケールのtRNS透明色、未対応圧縮・フィルタ方式、未知の必須チャンクは生成側adapterで未評価とする。色プロファイル変換はせずsRGBと仮定する。APIにrequest/responseのOpenAPI定義と人工fixtureを同梱した。診断と人の比較を非公開で渡す手順は [COMPLETE-PNG-ANALYSIS.md](COMPLETE-PNG-ANALYSIS.md)。
