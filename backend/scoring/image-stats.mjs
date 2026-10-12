// 展開済み画像（RGBA）の統計。実PNG分析の土台で、採点にはまだ接続していない。
// 値は「画像の性質の記述」で、読みやすさやクリック率を直接示すものではない。

/** sRGBの相対輝度（0〜1）。layout.mjs の luminance と同じ式。 */
export function relLuminance(r, g, b) {
  const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
  return lin(r) * .2126 + lin(g) * .7152 + lin(b) * .0722;
}
const ratio = (x, y) => (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p / 100 * (sorted.length - 1))))];

/**
 * 矩形内（省略時は画像全体）の輝度の統計。透明に近い画素（alpha<128）は数えない。
 * step で間引いて計算量を抑える（1280×720 なら step=2 で約23万画素）。
 */
/** 矩形内の不透明な画素（alpha>=128）を step ごとに間引いて fn(r, g, b) に渡す。step・rect は検証する。 */
function eachPixel(img, rect, step, fn) {
  // step が0・負数・小数・NaN・無限大だとループが終わらない、または意味を持たないため拒否する
  if (!Number.isSafeInteger(step) || step < 1) throw new RangeError(`step は1以上の整数にしてください（${step}）`);
  if (![rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite)) throw new RangeError('rect の x・y・width・height は有限の数にしてください');
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width)), y1 = Math.min(img.height, Math.ceil(rect.y + rect.height));
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const o = (y * img.width + x) * 4;
    if (img.rgba[o + 3] >= 128) fn(img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]);
  }
}
const whole = img => ({ x: 0, y: 0, width: img.width, height: img.height });

export function regionStats(img, rect = whole(img), { step = 2 } = {}) {
  const lums = [];
  eachPixel(img, rect, step, (r, g, b) => lums.push(relLuminance(r, g, b)));
  if (!lums.length) return null; // 範囲が画像外、またはすべて透明
  lums.sort((a, b) => a - b);
  const mean = lums.reduce((s, v) => s + v, 0) / lums.length;
  const std = Math.sqrt(lums.reduce((s, v) => s + (v - mean) ** 2, 0) / lums.length);
  return { samples: lums.length, mean, std, p5: pct(lums, 5), p50: pct(lums, 50), p95: pct(lums, 95) };
}

/**
 * 文字色に対して、背面の明るい側（p95）と暗い側（p5）のうち不利な方とのコントラスト比。
 * 背面に文字そのものが含まれていない画像（文字を重ねる前の背景）に使う前提。
 */
export function worstContrastAgainst(foregroundHex, stats) {
  const [r, g, b] = foregroundHex.slice(1).match(/../g).map(h => parseInt(h, 16));
  const fg = relLuminance(r, g, b);
  return Math.min(ratio(fg, stats.p5), ratio(fg, stats.p95));
}

/** ほぼ単色の画像（真っ白・真っ黒・生成失敗の一色画像など）かどうか。低品質の兆候の一つとして使う。 */
export function isNearlyUniform(stats, { maxStd = 0.01, maxSpread = 0.02 } = {}) {
  return stats.std <= maxStd && stats.p95 - stats.p5 <= maxSpread;
}

/**
 * 彩度（色の鮮やかさ）の統計。診断情報で、彩度が高いこと自体を低品質とはしない（動画内容との相性は人が判断する）。
 * - saturation: HSVの彩度 (max−min)/max（0〜1）の平均・p50・p95
 * - highSaturationShare: 彩度0.8以上かつ明るさ0.3以上の画素の割合（はっきり鮮やかな部分の広さ）
 * - colorfulness: Hasler & Süsstrunk (2003) の色彩度指標（0〜255の画素値で計算。目安：15未満はほぼ無彩色、80超は非常に鮮やか）
 */
export function saturationStats(img, rect = whole(img), { step = 2 } = {}) {
  const sats = []; let high = 0, rgSum = 0, ybSum = 0, rgSq = 0, ybSq = 0;
  eachPixel(img, rect, step, (r, g, b) => {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), s = max ? (max - min) / max : 0;
    sats.push(s); if (s >= 0.8 && max / 255 >= 0.3) high++;
    const rg = r - g, yb = (r + g) / 2 - b; rgSum += rg; ybSum += yb; rgSq += rg * rg; ybSq += yb * yb;
  });
  const n = sats.length; if (!n) return null;
  sats.sort((a, b) => a - b);
  const mrg = rgSum / n, myb = ybSum / n, srg = Math.sqrt(Math.max(0, rgSq / n - mrg ** 2)), syb = Math.sqrt(Math.max(0, ybSq / n - myb ** 2));
  return { samples: n, saturation: { mean: sats.reduce((s, v) => s + v, 0) / n, p50: pct(sats, 50), p95: pct(sats, 95) }, highSaturationShare: high / n, colorfulness: Math.hypot(srg, syb) + 0.3 * Math.hypot(mrg, myb) };
}

/** 色の分布（RGB各チャンネルを bins 段階に分けた3次元ヒストグラム、合計1）。画素の位置には依存しない。 */
export function colorHistogram(img, rect = whole(img), { step = 2, bins = 8 } = {}) {
  if (!Number.isSafeInteger(bins) || bins < 2 || bins > 32) throw new RangeError(`bins は2〜32の整数にしてください（${bins}）`);
  const hist = new Float64Array(bins ** 3), q = v => Math.min(bins - 1, Math.floor(v * bins / 256)); let n = 0;
  eachPixel(img, rect, step, (r, g, b) => { hist[(q(r) * bins + q(g)) * bins + q(b)]++; n++; });
  if (!n) return null;
  for (let i = 0; i < hist.length; i++) hist[i] /= n;
  return { bins, samples: n, hist };
}

/**
 * 2つの色の分布の重なり（ヒストグラム交差、0〜1。1は同じ色の割合）。人物が動いても値は変わらない。
 * 写真の保持の「目安の一つ」で、色が同じでも内容が描き直されている場合は区別できない。
 */
export function histogramIntersection(a, b) {
  if (!a || !b || a.bins !== b.bins) throw new RangeError('同じ bins のヒストグラムを渡してください');
  let s = 0; for (let i = 0; i < a.hist.length; i++) s += Math.min(a.hist[i], b.hist[i]);
  return s;
}
