// metadata.textLayout（v1）からの文字配置の読み取り（docs/METADATA-PROPOSAL.md で合意した形式）。
// 異常値のある要素は未評価にし、SVG解析で推測を補わない。
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = v => typeof v === 'number' && Number.isFinite(v);
const nonNeg = v => num(v) && v >= 0;
const BACKDROPS = ['solid', 'image', 'unknown'];

/** textLayout が無い・未知の版・未知の座標系なら null（呼び出し側が従来のSVG解析へ戻る）。 */
export function readTextLayout(metadata) {
  const tl = metadata?.textLayout;
  if (!tl || typeof tl !== 'object') return null;
  if (!/^1\.\d+\.\d+$/.test(tl.version ?? '') || tl.coordinateSpace !== 'canvas_px') return null;
  return { version: tl.version, elements: Array.isArray(tl.elements) ? tl.elements : [] };
}

/** 要素の検証。問題があれば理由の配列を返す（空なら正常）。 */
export function elementProblems(e) {
  const p = [];
  if (!e || typeof e !== 'object') return ['要素の形式が不正'];
  if (!['title', 'footer'].includes(e.role)) p.push('role');
  if (typeof e.text !== 'string') p.push('text');
  for (const k of ['x', 'baselineY']) if (!num(e[k])) p.push(k);
  if (!(num(e.fontSize) && e.fontSize > 0)) p.push('fontSize');
  if (!HEX.test(e.foreground ?? '')) p.push('foreground');
  if (!['estimated', 'rendered', 'unknown'].includes(e.measurement)) p.push('measurement');
  for (const k of ['width', 'height']) if (e[k] !== null && !nonNeg(e[k])) p.push(k);
  if (e.topY !== null && !num(e.topY)) p.push('topY');
  const r = e.textRegion, pad = r?.padding;
  if (!r || ![r.x, r.y].every(num) || !(num(r.width) && r.width > 0) || !(num(r.height) && r.height > 0)) p.push('textRegion');
  else if (!pad || ![pad.top, pad.right, pad.bottom, pad.left].every(nonNeg)) p.push('textRegion.padding');
  const b = e.textBackdrop;
  if (!b || !BACKDROPS.includes(b.kind)) p.push('textBackdrop');
  else if (b.kind === 'solid' ? !HEX.test(b.color ?? '') : b.color !== null) p.push('textBackdrop.color');
  return p;
}

/**
 * 各要素を採点用の形にする。
 * overflow: 数値＝上下左右のはみ出し量(px)、null＝収まり未評価（寸法がnull・measurement=unknown・異常値）。
 * state: solid（背面色あり）／over_image／unevaluated（unknown・異常値）。
 */
export function analyzeTextLayout(layout) {
  return layout.elements.map(e => {
    const problems = elementProblems(e);
    if (problems.length) return { role: e?.role === 'footer' ? 'footer' : 'title', invalid: problems, overflow: null, state: 'unevaluated', fs: null };
    const measured = e.measurement !== 'unknown' && [e.width, e.height, e.topY].every(v => v !== null);
    const r = e.textRegion, pad = r.padding;
    const overflow = measured ? Math.max(0,
      e.x + e.width - (r.x + r.width - pad.right),
      e.topY + e.height - (r.y + r.height - pad.bottom),
      r.x + pad.left - e.x,
      r.y + pad.top - e.topY) : null;
    const state = e.textBackdrop.kind === 'solid' ? 'solid' : e.textBackdrop.kind === 'image' ? 'over_image' : 'unevaluated';
    return { role: e.role, invalid: null, fs: e.fontSize, fill: e.foreground, backdropFill: e.textBackdrop.color, state, overflow, measurement: e.measurement };
  });
}
