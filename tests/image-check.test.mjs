import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { score } from '../backend/scoring/index.mjs';
import { checkImage } from '../backend/scoring/image-check.mjs';
// 人工画像のみ。PNGはヘッダー（IHDR）だけ正しく作る。
const png = (w, h) => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]); };
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(1))), chunk('IEND', Buffer.alloc(0))]);
};
const svg = (w = 1280, h = 720) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#172554"/><text x="80" y="300" font-size="48" fill="#ffffff">動画</text></svg>`);
const url = (type, buf) => `data:${type};base64,${buf.toString('base64')}`;
const meta = { textLength: 2, lineCount: 1, fontSize: 48, foreground: '#ffffff', background: '#172554' };
const all = a => [...a.reasons, ...a.limitations].join('\n');

test('usable images: correct SVG and PNG headers pass, sizes are read', () => {
  assert.deepEqual(checkImage({ imageDataUrl: url('image/svg+xml', svg()), mimeType: 'image/svg+xml', width: 1280, height: 720 }).issues, []);
  const p = checkImage({ imageDataUrl: url('image/png', png(1280, 720)), mimeType: 'image/png', width: 1280, height: 720 });
  assert.equal(p.usable, true); assert.deepEqual([p.width, p.height], [1280, 720]); assert.deepEqual(p.issues, []);
});

test('missing, malformed, empty, mismatched or corrupt images are unusable', () => {
  const cases = {
    missing: {},
    notDataUrl: { imageDataUrl: 'https://example.invalid/a.png' },
    badBase64: { imageDataUrl: 'data:image/png;base64,abc' },
    empty: { imageDataUrl: 'data:image/png;base64,' },
    mimeMismatch: { imageDataUrl: url('image/png', png(1280, 720)), mimeType: 'image/jpeg' },
    contentMismatch: { imageDataUrl: url('image/png', svg()) },
    truncatedPng: { imageDataUrl: url('image/png', png(1280, 720).subarray(0, 12)) },
    garbage: { imageDataUrl: url('image/svg+xml', Buffer.from('not an image')) },
  };
  for (const [name, c] of Object.entries(cases)) {
    const r = checkImage(c);
    assert.equal(r.usable, false, name); assert.ok(r.issues.length === 1, name);
  }
});

test('low resolution, size mismatch and non-16:9 are reported but still usable', () => {
  const low = checkImage({ imageDataUrl: url('image/png', png(640, 360)), mimeType: 'image/png', width: 1280, height: 720 });
  assert.equal(low.usable, true);
  assert.ok(low.issues.some(i => i.includes('一致しません'))); assert.ok(low.issues.some(i => i.includes('解像度が想定')));
  const square = checkImage({ imageDataUrl: url('image/png', png(1280, 1280)), width: 1280, height: 1280 });
  assert.ok(square.issues.some(i => i.includes('16:9')));
});

test('an unusable image is not scored from metadata or SVG: contrast 0, overall <= 50, reason stated', async () => {
  const good = await score({ imageDataUrl: url('image/svg+xml', svg()), mimeType: 'image/svg+xml', width: 1280, height: 720, metadata: meta }, {});
  assert.equal(good.metrics.contrast, 100);
  for (const c of [{}, { imageDataUrl: url('image/png', svg()) }, { imageDataUrl: url('image/svg+xml', svg()), mimeType: 'image/png' }]) {
    const a = await score({ ...c, width: 1280, height: 720, metadata: meta }, {});
    assert.equal(a.metrics.contrast, 0); assert.ok(a.overall <= 50 && a.overall < good.overall);
    assert.match(a.reasons[0], /画像を使えないため/); assert.match(all(a), /画像: /);
    assert.doesNotMatch(all(a), /収まっています|はみ出します|配色のコントラスト比/);
  }
});

test('a low-resolution but valid image is still scored, with the issue as a limitation', async () => {
  const a = await score({ imageDataUrl: url('image/svg+xml', svg(640, 360)), mimeType: 'image/svg+xml', width: 640, height: 360, metadata: meta }, {});
  assert.ok(a.metrics.contrast > 0); assert.ok(a.limitations.some(l => l.includes('解像度が想定')));
});
