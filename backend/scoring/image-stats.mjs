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
export function regionStats(img, rect = { x: 0, y: 0, width: img.width, height: img.height }, { step = 2 } = {}) {
  const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width)), y1 = Math.min(img.height, Math.ceil(rect.y + rect.height));
  const lums = [];
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const o = (y * img.width + x) * 4;
    if (img.rgba[o + 3] < 128) continue;
    lums.push(relLuminance(img.rgba[o], img.rgba[o + 1], img.rgba[o + 2]));
  }
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
