// SVG候補のレイアウト解析（依存なし・ネットワークなし）。解析できない場合は null や unevaluated を返す。
const HEX = /^#[0-9a-fA-F]{6}$/;
export function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(h => parseInt(h, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
export function contrastRatio(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
const unescapeXml = s => s.replace(/&(lt|gt|quot|apos|amp);/g, (_, n) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' }[n]));
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
/** 文字種から幅（em単位）を推定する。実描画とは異なる場合がある。 */
export function estimateWidth(text, fontSize) {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c >= 0xFF61 && c <= 0xFF9F) em += .5;
    else if (c < 0x80) em += .62;
    else if (c >= 0x2E80 && c <= 0xA4CF || c >= 0xAC00 && c <= 0xD7A3 || c >= 0xF900 && c <= 0xFAFF || c >= 0xFE30 && c <= 0xFE6F || c >= 0xFF00 && c <= 0xFFE6 || c >= 0x1F000 || c >= 0x20000) em += 1;
    else em += .8;
  }
  return em * fontSize;
}
/** data:image/svg+xml;base64 を rect/text/image の順序付きリストにする。非対応なら null。 */
export function parseSvg(dataUrl) {
  const m = /^data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? '');
  if (!m) return null;
  const svg = Buffer.from(m[1], 'base64').toString('utf8');
  if (/\btransform=|text-anchor=|<(script|foreignObject|use)\b/.test(svg)) return null;
  const root = /<svg\b([^>]*)>/.exec(svg);
  if (!root) return null;
  const { width, height } = attrs(root[1]);
  if (!(Number(width) > 0) || !(Number(height) > 0)) return null;
  const items = [];
  for (const t of svg.matchAll(/<rect\b([^>]*?)\/?>|<image\b([^>]*?)\/?>|<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    if (t[1] !== undefined) {
      const a = attrs(t[1]);
      items.push({ type: 'rect', x: +(a.x ?? 0), y: +(a.y ?? 0), w: +a.width, h: +a.height, fill: a.fill, opaque: a.fill !== undefined && HEX.test(a.fill) && a.opacity === undefined && a['fill-opacity'] === undefined });
    } else if (t[2] !== undefined) {
      const a = attrs(t[2]);
      items.push({ type: 'image', x: +(a.x ?? 0), y: +(a.y ?? 0), w: +(a.width ?? width), h: +(a.height ?? height) });
    } else {
      const a = attrs(t[3]), fs = +a['font-size'];
      if (!(fs > 0)) return null;
      items.push({ type: 'text', x: +a.x, baseline: +a.y, fs, fill: a.fill, text: unescapeXml(t[4].replace(/<[^>]*>/g, '')) });
    }
  }
  return { width: +width, height: +height, items };
}
const within = (b, r) => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
const overlaps = (b, r) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
/**
 * 各テキストの背面と収まりを調べる。
 * 背面が単色の矩形に完全に含まれる場合だけコントラストを評価し、背景画像の上は未評価にする。
 */
export function analyzeLayout(parsed) {
  const { width, height, items } = parsed;
  const texts = [];
  items.forEach((it, idx) => {
    if (it.type !== 'text') return;
    const w = estimateWidth(it.text, it.fs);
    const box = { x: it.x, y: it.baseline - it.fs * .88, w, h: it.fs * 1.08 };
    let backdrop = null, state = 'unevaluated';
    for (let i = idx - 1; i >= 0; i--) {
      const p = items[i];
      if (p.type === 'text' || !overlaps(box, p)) continue;
      if (p.type === 'image') { state = 'over_image'; break; }
      if (p.opaque && within(box, p)) { backdrop = p; state = 'solid'; }
      else state = 'partial';
      break;
    }
    const region = backdrop && (backdrop.w < width || backdrop.h < height) ? { x: backdrop.x, y: backdrop.y, w: backdrop.w, h: backdrop.h, pad: 16 } : { x: 0, y: 0, w: width, h: height, pad: 40 };
    const overflow = Math.max(0, box.x + box.w - (region.x + region.w - region.pad), box.y + box.h - (region.y + region.h - region.pad), region.x + region.pad - box.x);
    texts.push({ ...it, box, state, backdropFill: backdrop?.fill, overflow, region });
  });
  return { width, height, texts };
}
