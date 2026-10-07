# 採点用metadata拡張案（共同レビュー前・未実装）

既存のmetadata、Candidate、Assessmentの項目を保持し、以下を追加する案です。
合意後にOpenAPI・生成実装・fixture・契約テストを同じPRで更新します。
採点側は旧候補では従来のSVG解析へフォールバック。metricsの変更は別途合意します。

## 項目

- `metadata.generation_version`: 配置・改行・文字寸法・配色・背景合成を含む生成処理の版。採点versionとは別。初回案は `0.3.0`。モデル名の代わりには使いません。
- `metadata.textLayout.version`: このレイアウト情報の形式の版。初回は `1.0.0`。
- `metadata.textLayout.coordinateSpace`: `canvas_px` 固定。原点は画像左上、右が+x、下が+y。Candidateのwidth/heightを基準に、小数可。縮小前の値です。
- `metadata.textLayout.elements`: タイトル各行とフッターを、それぞれ1要素として描画順に記録。

各要素は以下を持ちます。

| 項目 | 意味 |
|---|---|
| id, role, lineIndex | 安定した行ID、`title` / `footer`、0始まりの行番号 |
| text | 実際に描画する行の文字列 |
| x, baselineY | 左端と文字のベースライン。描画位置 |
| width, height, topY | 文字の外接範囲。測定不能ならnull（0で代用しない） |
| measurement | `estimated` / `rendered` / `unknown`。推定を実測と表示しない |
| measurementVersion | 寸法算出法の版。unknownの場合null |
| fontSize, fontFamily, fontWeight | 指定したpxサイズ・フォント一覧・太さ |
| resolvedFontFamily | 実際に使用したフォント。未固定・未確認ならnull |
| foreground | 文字色（#RRGGBB） |
| textRegion | 意図した配置領域のx/y/width/heightとpadding（top/right/bottom/left）。文字が完全に外でも変えない |
| textBackdrop | `kind`: solid/image/unknown。solidならcolor、その他はcolor=null |

`textBackdrop`は領域全体を保証できる場合だけsolidにします。パネルをはみ出す文字はimageまたはunknownとして、metadataだけからコントラストを確定しません。
フッターも独立した配置領域を持たせます。文字サイズの大小からタイトルかどうかを推測する必要をなくします。
角丸や半透明、混合背景の保証が難しい場合はunknownとします。

## 採点側との境界

- 収まりはtextRegionと文字範囲の上下左右で判定。背景色の検出から配置領域を変更しない。
- estimatedなら評価根拠にも推定と明記。unknownなら収まりは未評価。
- fontFamilyは指定値、resolvedFontFamilyは実際の値。フォント固定と実測寸法はPNG書き出しの段階で対応。
- metadataと画像が一致するかは生成側の契約テストで確認。異常値（非有限数、負の寸法など）は未評価にする。
- 共有PNGの保存先・一度だけデコードする仕組みは別の画像資産契約として相談。今回のmetadata拡張だけでは解決しない。

## 相手への確認

行ごとのtextBoxesを独立配列にする代わりに、elementsへ範囲・配置領域・背面をまとめる案です。
この形式で評価に必要な情報が足りるか、旧候補へのフォールバックと未評価の扱いを確認してください。
本案は仕様合意用です。現在のAPIレスポンスにはまだ追加されていません。
