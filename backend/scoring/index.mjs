import { analyzeLayout, contrastRatio, parseSvg } from './layout.mjs';
import { analyzeTextLayout, readTextLayout } from './metadata-layout.mjs';
const VERSION = '0.3.0';
const MIN_FONT = 48; // 仮説: 一覧で縮小表示されても読める目安。検証前の仮値で、実データで校正していない。

/** 評価に使う文字の一覧を、metadata.textLayout（v1）か、無ければSVG解析から作る。 */
function textsFor(candidate) {
  const tl = readTextLayout(candidate.metadata);
  if (tl) return { method: 'metadata', label: `metadataのtextLayout（v${tl.version}）`, texts: analyzeTextLayout(tl) };
  const parsed = parseSvg(candidate.imageDataUrl);
  const layout = parsed && analyzeLayout(parsed);
  if (!layout) return { method: 'none', label: 'metadataの配色のみ（文字配置は未解析）', texts: [] };
  // SVGには役割の情報が無いため、最大の文字サイズをタイトル、それ以外をフッターなどの小さな文字とみなす
  const maxFs = Math.max(...layout.texts.map(t => t.fs));
  return { method: 'svg', label: 'SVGの構造解析（textLayoutなし）', texts: layout.texts.map(t => ({ ...t, role: t.fs === maxFs ? 'title' : 'footer', invalid: null, measurement: 'estimated' })) };
}

/** Contract: score(candidate, input) => Promise<Assessment>. No network or generation imports. */
export async function score(candidate, input) {
  const m = candidate.metadata;
  const { method, label, texts } = textsFor(candidate);
  const title = texts.filter(t => t.role === 'title'), small = texts.filter(t => t.role === 'footer');
  const validTitle = title.filter(t => !t.invalid);
  const maxFs = validTitle.length ? Math.max(...validTitle.map(t => t.fs)) : m.fontSize;
  const reasons = [`評価方法: ${label}`], limitations = [];
  const invalid = texts.filter(t => t.invalid);
  if (invalid.length) limitations.push(`textLayoutの${invalid.length}要素に異常値（${[...new Set(invalid.flatMap(t => t.invalid))].join(', ')}）があるため、その要素は未評価です。SVG解析では補っていません。`);

  // contrast: タイトルの全行の背面が単色と確認できた場合のみ文字と背面の色から。できなければメタデータの配色
  let ratio = contrastRatio(m.foreground, m.background), source = 'metadata';
  if (title.length && title.every(t => !t.invalid && t.state === 'solid')) { ratio = Math.min(...title.map(t => contrastRatio(t.fill, t.backdropFill))); source = 'layout'; }
  else if (method !== 'none') limitations.push('タイトル文字の背面を単色と確認できないため、配色はメタデータから評価しました。文字と背面のコントラストは未評価です。');
  const contrast = Math.min(100, Math.round(ratio / 7 * 100));

  const brevity = Math.max(0, 100 - Math.max(0, m.textLength - 15) * 2);

  // font: 文字サイズ(48px以上で満点＝検証前の仮値)に、配置領域からの上下左右のはみ出し分を減点
  const sizeScore = Math.min(100, Math.round(maxFs / MIN_FONT * 100));
  const measured = title.filter(t => t.overflow !== null);
  const overflow = measured.length ? Math.max(...measured.map(t => t.overflow)) : 0;
  const fitPenalty = Math.min(100, Math.round(overflow / maxFs * 50));
  const font = Math.max(0, sizeScore - fitPenalty);
  const fitUnevaluated = method !== 'none' && (title.length === 0 || measured.length < title.length);
  const estimated = measured.some(t => t.measurement === 'estimated');

  const overall = Math.round(contrast * .5 + brevity * .3 + font * .2);
  reasons.push(`配色のコントラスト比: ${ratio.toFixed(1)}（${source === 'layout' ? '画像内の文字と背面の色' : 'メタデータの配色'}）`, `タイトル ${m.textLength}文字・${m.lineCount}行`);
  if (m.textLength > 30) reasons.push('文字を短くした案も比較してください。');
  if (overflow > 0) reasons.push(`${estimated ? '推定で' : ''}タイトルが領域から約${Math.round(overflow)}px はみ出します。文字数や行数を見直してください。`);
  else if (measured.length && !fitUnevaluated) reasons.push(`タイトルは${estimated ? '推定で' : ''}領域内に収まっています。`);
  if (fitUnevaluated) limitations.push('文字の寸法が無い・不明な行があるため、その行の収まりは未評価です。');
  const lowSmall = small.filter(t => !t.invalid && t.state === 'solid' && contrastRatio(t.fill, t.backdropFill) < 4.5);
  if (lowSmall.length) reasons.push('小さな文字のコントラスト比が4.5未満です。');
  if (small.some(t => !t.invalid && t.state !== 'solid')) limitations.push('背景画像の上にある小さな文字（フッターなど）のコントラストは未評価です。');
  if (method === 'none') limitations.push(candidate.imageDataUrl?.startsWith('data:image/svg+xml') ? 'SVGの構造を解析できないため、文字の収まりと背面は未評価です。' : 'SVG以外の画像は文字領域を分析していません。メタデータのみで評価しました。');
  if (estimated) limitations.push(method === 'svg' ? '文字幅は文字種からの推定値で、実際の描画とは異なる場合があります。' : '文字範囲は生成側の推定値（measurement=estimated）で、実際の描画とは異なる場合があります。');
  limitations.push('画像内容・ジャンル適合は未評価。', '重みと閾値は仮説で、実データで校正していません。', 'CTR予測や効果保証ではありません。');
  return { overall, kind: 'layout_heuristic', version: VERSION, metrics: { contrast, brevity, font }, reasons, limitations };
}
