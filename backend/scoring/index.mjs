import { analyzeLayout, contrastRatio, parseSvg } from './layout.mjs';
const VERSION = '0.2.1';
const MIN_FONT = 48; // 仮説: 一覧で縮小表示されても読める目安。実データで校正していない。
/** Contract: score(candidate, input) => Promise<Assessment>. No network or generation imports. */
export async function score(candidate, input) {
  const m = candidate.metadata;
  const parsed = parseSvg(candidate.imageDataUrl);
  const layout = parsed && analyzeLayout(parsed);
  const maxFs = layout?.texts.length ? Math.max(...layout.texts.map(t => t.fs)) : m.fontSize;
  const title = layout?.texts.filter(t => t.fs === maxFs) ?? [];
  const small = layout?.texts.filter(t => t.fs < maxFs) ?? [];
  const reasons = [], limitations = [];

  // contrast: 文字の背面が単色と確認できた場合のみ画像から、できなければメタデータの配色
  let ratio = contrastRatio(m.foreground, m.background), source = 'metadata';
  const solid = title.filter(t => t.state === 'solid' && /^#[0-9a-fA-F]{6}$/.test(t.fill ?? ''));
  if (title.length && solid.length === title.length) { ratio = Math.min(...solid.map(t => contrastRatio(t.fill, t.backdropFill))); source = 'layout'; }
  else if (layout) limitations.push('タイトル文字の背面を単色と確認できないため、配色はメタデータから評価しました。');
  const contrast = Math.min(100, Math.round(ratio / 7 * 100));

  const brevity = Math.max(0, 100 - Math.max(0, m.textLength - 15) * 2);

  // font: 文字サイズ(48px以上で満点＝検証前の仮値)に、領域からの4方向のはみ出し分を減点
  const sizeScore = Math.min(100, Math.round(maxFs / MIN_FONT * 100));
  const overflow = title.length ? Math.max(...title.map(t => t.overflow)) : 0;
  const fitPenalty = Math.min(100, Math.round(overflow / maxFs * 50));
  const font = Math.max(0, sizeScore - fitPenalty);

  const overall = Math.round(contrast * .5 + brevity * .3 + font * .2);
  reasons.push(`配色のコントラスト比: ${ratio.toFixed(1)}（${source === 'layout' ? '画像内の文字と背面の色' : 'メタデータの配色'}）`, `タイトル ${m.textLength}文字・${m.lineCount}行`);
  if (m.textLength > 30) reasons.push('文字を短くした案も比較してください。');
  if (overflow > 0) reasons.push(`推定でタイトルが領域から約${Math.round(overflow)}px はみ出します。文字数や行数を見直してください。`);
  else if (layout) reasons.push('タイトルは推定で領域内に収まっています。');
  const lowSmall = small.filter(t => t.state === 'solid' && contrastRatio(t.fill, t.backdropFill) < 4.5);
  if (lowSmall.length) reasons.push('小さな文字のコントラスト比が4.5未満です。');
  if (small.some(t => t.state !== 'solid')) limitations.push('背景画像の上にある小さな文字（フッターなど）のコントラストは未評価です。');
  if (!layout) limitations.push(candidate.imageDataUrl?.startsWith('data:image/svg+xml') ? 'SVGの構造を解析できないため、文字の収まりと背面は未評価です。' : 'SVG以外の画像は文字領域を分析していません。メタデータのみで評価しました。');
  limitations.push('文字幅は文字種からの推定値で、実際の描画とは異なる場合があります。', '画像内容・ジャンル適合は未評価。', '重みと閾値は仮説で、実データで校正していません。', 'CTR予測や効果保証ではありません。');
  return { overall, kind: 'layout_heuristic', version: VERSION, metrics: { contrast, brevity, font }, reasons, limitations };
}
