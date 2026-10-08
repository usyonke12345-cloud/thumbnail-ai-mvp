import { analyzeLayout, contrastRatio, parseSvg } from './layout.mjs';
import { analyzeTextLayout, readTextLayout } from './metadata-layout.mjs';
import { checkImage } from './image-check.mjs';
const VERSION = '0.4.0';
// 重み（%、合計100）。仮説で未校正。METRIC_KEYS の順が unevaluated の並び順になる。
export const WEIGHTS = { contrast: 50, brevity: 30, font: 10, fit: 10 };
const METRIC_KEYS = ['contrast', 'brevity', 'font', 'fit'];
const MIN_FONT = 48; // 仮説: 一覧で縮小表示されても読める目安。検証前の仮値で、実データで校正していない。

/** 評価に使う文字の一覧を、metadata.textLayout（v1）か、無ければSVG解析から作る。 */
function textsFor(candidate, image) {
  // 画像が欠損・破損・形式不一致なら、metadataやSVGがあっても画像に基づく評価はしない（推測しない）
  if (!image.usable) return { method: 'unusable', label: '画像を使えないため文字配置は未評価（metadataの文字サイズ・文字数のみ）', texts: [] };
  const tl = readTextLayout(candidate.metadata);
  if (tl) return { method: 'metadata', label: `metadataのtextLayout（v${tl.version}）`, texts: analyzeTextLayout(tl) };
  const parsed = parseSvg(candidate.imageDataUrl);
  const layout = parsed && analyzeLayout(parsed);
  // 解析できないSVG、text要素が無いSVG（文字をpathにした画像など）、SVG以外の画像は、文字配置を未解析とする
  if (!layout || !layout.texts.length) return { method: 'none', label: '文字配置は未解析（textLayoutなし、画像から文字を読み取れない）', texts: [] };
  // SVGには役割の情報が無いため、最大の文字サイズをタイトル、それ以外をフッターなどの小さな文字とみなす
  const maxFs = Math.max(...layout.texts.map(t => t.fs));
  return { method: 'svg', label: 'SVGの構造解析（textLayoutなし）', texts: layout.texts.map(t => ({ ...t, role: t.fs === maxFs ? 'title' : 'footer', invalid: null, measurement: 'estimated' })) };
}

/** Contract: score(candidate, input) => Promise<Assessment>. No network or generation imports. */
export async function score(candidate, input) {
  const m = candidate.metadata;
  const image = checkImage(candidate);
  const { method, label, texts } = textsFor(candidate, image);
  const title = texts.filter(t => t.role === 'title'), small = texts.filter(t => t.role === 'footer');
  const validTitle = title.filter(t => !t.invalid);
  const maxFs = validTitle.length ? Math.max(...validTitle.map(t => t.fs)) : m.fontSize;
  const reasons = [`評価方法: ${label}`], limitations = [];
  if (!image.usable) reasons.push(`画像: ${image.issues.join(' ')}文字の配置・背面・コントラストは未評価です。`);
  else limitations.push(...image.issues);
  const invalid = texts.filter(t => t.invalid);
  if (invalid.length) limitations.push(`textLayoutの${invalid.length}要素に異常値（${[...new Set(invalid.flatMap(t => t.invalid))].join(', ')}）があるため、その要素は未評価です。SVG解析では補っていません。`);

  // 各項目は評価できたときだけ数値、できなければ null（0点とは区別する）。重みと閾値は仮説で未校正。
  // contrast: タイトルの全行が正常な値で、背面が単色と確認できた場合だけ評価する（metadataの配色では代用しない）
  const contrastEvaluated = title.length > 0 && title.every(t => !t.invalid && t.state === 'solid');
  const ratio = contrastEvaluated ? Math.min(...title.map(t => contrastRatio(t.fill, t.backdropFill))) : null;
  const contrast = contrastEvaluated ? Math.min(100, Math.round(ratio / 7 * 100)) : null;
  const uncheckedWhy = method === 'unusable' ? '画像を使えない'
    : method === 'none' ? '文字の配置と背面を確認できない'
    : title.length === 0 ? 'タイトルの行が見つからない'
    : title.some(t => t.invalid) ? 'タイトルの要素に異常値がある'
    : title.some(t => t.state === 'over_image') ? 'タイトル文字の背面が画像で、単色と確認できない'
    : 'タイトル文字の背面を単色と確認できない';

  const brevity = Number.isFinite(m.textLength) ? Math.max(0, 100 - Math.max(0, m.textLength - 15) * 2) : null;

  // font: 文字サイズのみ（48px以上で満点＝検証前の仮値）
  const font = Number.isFinite(maxFs) && maxFs > 0 ? Math.min(100, Math.round(maxFs / MIN_FONT * 100)) : null;

  // fit: タイトルの全行が測定済み（rendered/estimated、寸法あり、正常な値）のときだけ、配置領域からの上下左右のはみ出しで減点
  const measured = title.filter(t => !t.invalid && t.overflow !== null);
  const fitEvaluated = (method === 'metadata' || method === 'svg') && title.length > 0 && measured.length === title.length;
  const overflow = fitEvaluated ? Math.max(...measured.map(t => t.overflow)) : 0;
  const fit = fitEvaluated ? Math.max(0, 100 - Math.round(overflow / maxFs * 50)) : null;
  const estimated = measured.some(t => t.measurement === 'estimated');

  const metrics = { contrast, brevity, font, fit };
  const unevaluated = METRIC_KEYS.filter(k => metrics[k] === null);
  const lower = METRIC_KEYS.reduce((sum, k) => sum + (metrics[k] ?? 0) * WEIGHTS[k] / 100, 0);
  const missing = unevaluated.reduce((sum, k) => sum + WEIGHTS[k], 0);
  const overall = Math.round(lower), overallMax = Math.round(lower + missing), coverage = 100 - missing;

  if (contrastEvaluated) reasons.push(`配色のコントラスト比: ${ratio.toFixed(1)}（画像内の文字と背面の色）`);
  else {
    reasons.push(`コントラスト: 未評価（${uncheckedWhy}ため）。`);
    limitations.push('文字と背面のコントラストは未評価です。metadataの配色（foreground/background）では代用していません。');
  }
  reasons.push(`タイトル ${m.textLength}文字・${m.lineCount}行`);
  if (m.textLength > 30) reasons.push('文字を短くした案も比較してください。');
  if (fitEvaluated && overflow > 0) reasons.push(`${estimated ? '推定で' : ''}タイトルが領域から約${Math.round(overflow)}px はみ出します。文字数や行数を見直してください。`);
  else if (fitEvaluated) reasons.push(`タイトルは${estimated ? '推定で' : ''}領域内に収まっています。`);
  else if (method === 'metadata' || method === 'svg') limitations.push('文字の寸法が無い・不明な行があるため、タイトルの収まりは未評価です。');
  if (unevaluated.length) reasons.push(`未評価: ${unevaluated.join(', ')}。総合点は評価できた項目からの暫定範囲（${overall}〜${overallMax}点、評価範囲${coverage}%）で、統計的な信頼区間やCTR予測ではありません。`);
  const lowSmall = small.filter(t => !t.invalid && t.state === 'solid' && contrastRatio(t.fill, t.backdropFill) < 4.5);
  if (lowSmall.length) reasons.push('小さな文字のコントラスト比が4.5未満です。');
  if (small.some(t => !t.invalid && t.state !== 'solid')) limitations.push('背景画像の上にある小さな文字（フッターなど）のコントラストは未評価です。');
  if (method === 'none') limitations.push(candidate.imageDataUrl?.startsWith('data:image/svg+xml') ? 'SVGの構造を解析できないか、文字がtext要素ではない（pathなど）ため、文字の収まりと背面は未評価です。' : 'SVG以外の画像は文字領域を分析していません。文字の収まりと背面は未評価です。');
  if (estimated) limitations.push(method === 'svg' ? '文字幅は文字種からの推定値で、実際の描画とは異なる場合があります。' : '文字範囲は生成側の推定値（measurement=estimated）で、実際の描画とは異なる場合があります。');
  limitations.push('画像内容・ジャンル適合は未評価。', '重みと閾値は仮説で、実データで校正していません。', 'CTR予測や効果保証ではありません。');
  return { overall, overallMax, coverage, unevaluated, weights: { ...WEIGHTS }, kind: 'layout_heuristic', version: VERSION, metrics, reasons, limitations };
}
