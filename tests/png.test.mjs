import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePng, PngError, MAX_PIXELS } from '../backend/scoring/png.mjs';
import { regionStats, worstContrastAgainst, isNearlyUniform } from '../backend/scoring/image-stats.mjs';

// テスト用の最小PNG書き出し（人工画像のみ）。各行にフィルタ0〜4を順に使い、展開の正しさを確かめる。
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); };
function encode({ width, height, colorType, depth = 8, bytes, palette, trns, interlace = 0, filters = true }) {
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const stride = Math.ceil(width * channels * depth / 8), bpp = Math.max(1, (channels * depth) >> 3);
  const rows = [];
  for (let y = 0; y < height; y++) {
    const cur = bytes.subarray(y * stride, (y + 1) * stride), prev = y ? bytes.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const f = filters ? y % 5 : 0, out = Buffer.alloc(stride + 1); out[0] = f;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : (() => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })();
      out[i + 1] = (cur[i] - pred) & 0xff;
    }
    rows.push(out);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = depth; ihdr[9] = colorType; ihdr[12] = interlace;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    ...(palette ? [chunk('PLTE', palette)] : []), ...(trns ? [chunk('tRNS', trns)] : []), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}
const pseudo = n => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + (i >> 3) * 11) & 0xff));

test('decodes RGB, RGBA, gray, gray+alpha with all five row filters', () => {
  const w = 7, h = 10;
  for (const [colorType, ch] of [[2, 3], [6, 4], [0, 1], [4, 2]]) {
    const bytes = pseudo(w * h * ch);
    const img = decodePng(encode({ width: w, height: h, colorType, bytes }));
    assert.equal(img.width, w); assert.equal(img.height, h);
    for (let p = 0; p < w * h; p++) {
      const s = bytes.subarray(p * ch, (p + 1) * ch), o = img.rgba.subarray(p * 4, p * 4 + 4);
      const expect = ch === 3 ? [s[0], s[1], s[2], 255] : ch === 4 ? [...s] : ch === 1 ? [s[0], s[0], s[0], 255] : [s[0], s[0], s[0], s[1]];
      assert.deepEqual([...o], expect, `colorType ${colorType} pixel ${p}`);
    }
  }
});

test('decodes palette images (8-bit and packed 2-bit) with tRNS', () => {
  const palette = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]), trns = Buffer.from([0, 128]);
  const img8 = decodePng(encode({ width: 4, height: 1, colorType: 3, bytes: Buffer.from([0, 1, 2, 3]), palette, trns }));
  assert.deepEqual([...img8.rgba], [255, 0, 0, 0, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 255, 255]);
  // 2bit: 1バイトに4画素（0,1,2,3）
  const img2 = decodePng(encode({ width: 4, height: 1, colorType: 3, depth: 2, bytes: Buffer.from([0b00011011]), palette, filters: false }));
  assert.deepEqual([...img2.rgba].filter((_, i) => i % 4 !== 3), [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
});

test('unsupported or broken PNGs throw PngError instead of guessing', () => {
  const ok = encode({ width: 2, height: 2, colorType: 2, bytes: pseudo(12) });
  const cases = {
    notPng: Buffer.from('not a png'),
    truncated: ok.subarray(0, ok.length - 20),
    interlaced: encode({ width: 2, height: 2, colorType: 2, bytes: pseudo(12), interlace: 1 }),
    depth16: (() => { const b = Buffer.from(ok); b[24] = 16; return b; })(),
    badFilter: (() => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0;
      return Buffer.concat([ok.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([9, 0]))), chunk('IEND', Buffer.alloc(0))]); })(),
    paletteOutOfRange: encode({ width: 1, height: 1, colorType: 3, bytes: Buffer.from([5]), palette: Buffer.from([0, 0, 0]) }),
    tooLarge: (() => { const b = Buffer.from(ok); b.writeUInt32BE(MAX_PIXELS, 16); b.writeUInt32BE(2, 20); return b; })(),
  };
  for (const [name, buf] of Object.entries(cases)) assert.throws(() => decodePng(buf), PngError, name);
});

test('region statistics, worst-case contrast and near-uniform detection', () => {
  // 左半分が黒・右半分が白の 20×10 画像
  const w = 20, h = 10, bytes = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bytes.fill(x < 10 ? 0 : 255, (y * w + x) * 3, (y * w + x) * 3 + 3);
  const img = decodePng(encode({ width: w, height: h, colorType: 2, bytes }));
  const left = regionStats(img, { x: 0, y: 0, width: 10, height: 10 }, { step: 1 }), all = regionStats(img, undefined, { step: 1 });
  assert.equal(left.mean, 0); assert.ok(isNearlyUniform(left));
  assert.ok(!isNearlyUniform(all)); assert.equal(all.p5, 0); assert.equal(all.p95, 1);
  assert.ok(worstContrastAgainst('#ffffff', left) > 20);              // 黒の上の白文字は高コントラスト
  assert.ok(Math.abs(worstContrastAgainst('#ffffff', all) - 1) < 1e-9); // 白い部分もある背面では最悪1:1
  assert.equal(regionStats(img, { x: 100, y: 100, width: 5, height: 5 }), null); // 画像外
});
