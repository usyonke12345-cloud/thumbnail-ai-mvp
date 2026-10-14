import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { decodePng, PngError } from '../backend/scoring/png.mjs';
import { regionStats, worstContrastAgainst, isNearlyUniform } from '../backend/scoring/image-stats.mjs';

// テスト用の最小PNG書き出し（人工画像のみ）。各行にフィルタ0〜4を順に使い、展開の正しさを確かめる。
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'latin1'), data]); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdrOf = (w, h, colorType = 6, depth = 8) => { const d = Buffer.alloc(13); d.writeUInt32BE(w, 0); d.writeUInt32BE(h, 4); d[8] = depth; d[9] = colorType; return d; };
// 展開後のデータ（フィルタ種別＋画素）をそのまま指定してPNGを組み立てる
const rawPng = (w, h, raw, { iend = true, after = Buffer.alloc(0) } = {}) =>
  Buffer.concat([SIG, chunk('IHDR', ihdrOf(w, h)), chunk('IDAT', deflateSync(raw)), ...(iend ? [chunk('IEND', Buffer.alloc(0))] : []), after]);
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
    depth16: Buffer.concat([SIG, chunk('IHDR', ihdrOf(2, 2, 2, 16)), chunk('IDAT', deflateSync(Buffer.alloc(2 * (1 + 12)))), chunk('IEND', Buffer.alloc(0))]), // CRCは正しく、ビット深度の理由で拒否
    badFilter: (() => { const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 0;
      return Buffer.concat([ok.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([9, 0]))), chunk('IEND', Buffer.alloc(0))]); })(),
    paletteOutOfRange: encode({ width: 1, height: 1, colorType: 3, bytes: Buffer.from([5]), palette: Buffer.from([0, 0, 0]) }),
    tooLarge: Buffer.concat([SIG, chunk('IHDR', ihdrOf(4096, 4097, 2)), chunk('IDAT', deflateSync(Buffer.alloc(1))), chunk('IEND', Buffer.alloc(0))]), // 画素数の上限超え（CRCは正しい）
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

test('reported cases: oversized inflated data and missing IEND are rejected (1×1 RGBA needs exactly 5 bytes)', () => {
  const good = Buffer.from([0, 10, 20, 30, 255]); // フィルタ0＋RGBA 1画素
  assert.deepEqual([...decodePng(rawPng(1, 1, good)).rgba], [10, 20, 30, 255]);
  assert.throws(() => decodePng(rawPng(1, 1, Buffer.concat([good, Buffer.alloc(65531)]))), /多すぎ/, '65,536バイトは拒否');
  assert.throws(() => decodePng(rawPng(1, 1, Buffer.concat([good, Buffer.alloc(1)]))), /多すぎ/, '1バイト余分でも拒否');
  assert.throws(() => decodePng(rawPng(1, 1, good.subarray(0, 4))), /一致しません/, '不足も拒否');
  assert.throws(() => decodePng(rawPng(1, 1, good, { iend: false })), /IENDがありません/);
  assert.throws(() => decodePng(rawPng(1, 1, good, { after: Buffer.from('extra') })), /余分なデータ/);
});

test('chunk structure is enforced: IHDR first and once, CRC matches, input size limit', async () => {
  const { MAX_INPUT_BYTES } = await import('../backend/scoring/png.mjs');
  const good = rawPng(1, 1, Buffer.from([0, 1, 2, 3, 255]));
  const idat = chunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3, 255]))), iend = chunk('IEND', Buffer.alloc(0)), ihdr = chunk('IHDR', ihdrOf(1, 1));
  assert.throws(() => decodePng(Buffer.concat([SIG, idat, ihdr, iend])), /先頭/);
  assert.throws(() => decodePng(Buffer.concat([SIG, ihdr, ihdr, idat, iend])), /複数/);
  const badCrc = Buffer.from(good); badCrc[good.length - 13] ^= 1; // IDATの末尾付近を1bit反転
  assert.throws(() => decodePng(badCrc), /CRC/);
  assert.throws(() => decodePng(Buffer.concat([good, Buffer.alloc(MAX_INPUT_BYTES)])), /大きすぎ/);
});

test('regionStats rejects step that is not a positive integer and non-finite rects', () => {
  const img = decodePng(rawPng(2, 1, Buffer.from([0, 0, 0, 0, 255, 255, 255, 255, 255])));
  for (const step of [0, -1, 1.5, NaN, Infinity, '2']) assert.throws(() => regionStats(img, undefined, { step }), RangeError, String(step));
  assert.throws(() => regionStats(img, { x: 0, y: 0, width: NaN, height: 1 }), RangeError);
  assert.equal(regionStats(img, undefined, { step: 1 }).samples, 2);
});

// 形式の検証（生成側 supportedEncoding の事前チェックを読み込み処理へ移したもの）。CRCは正しく作り、意図した理由で拒否されることを確認する。
const ihdrRaw = (w, h, { colorType = 6, depth = 8, compression = 0, filterMethod = 0, interlace = 0 } = {}) => {
  const d = Buffer.alloc(13); d.writeUInt32BE(w, 0); d.writeUInt32BE(h, 4); d[8] = depth; d[9] = colorType; d[10] = compression; d[11] = filterMethod; d[12] = interlace; return chunk('IHDR', d);
};
const assemble = (...chunks) => Buffer.concat([SIG, ...chunks, chunk('IEND', Buffer.alloc(0))]);
const idatOf = raw => chunk('IDAT', deflateSync(raw));

test('compression method, filter method and per-axis size are validated', () => {
  const rgba1 = idatOf(Buffer.from([0, 1, 2, 3, 255]));
  assert.throws(() => decodePng(assemble(ihdrRaw(1, 1, { compression: 1 }), rgba1)), /圧縮方式/);
  assert.throws(() => decodePng(assemble(ihdrRaw(1, 1, { filterMethod: 1 }), rgba1)), /フィルタ方式/);
  assert.throws(() => decodePng(assemble(ihdrRaw(5000, 1), idatOf(Buffer.alloc(1 + 5000 * 4)))), /対応範囲外/, '1辺が4096を超える');
});

test('unknown critical chunks are rejected, unknown ancillary chunks are skipped', () => {
  const ok = [ihdrRaw(1, 1), idatOf(Buffer.from([0, 1, 2, 3, 255]))];
  assert.throws(() => decodePng(assemble(ok[0], chunk('ABCD', Buffer.alloc(1)), ok[1])), /未対応の必須チャンク ABCD/);
  assert.deepEqual([...decodePng(assemble(ok[0], chunk('tEXt', Buffer.from('Comment\0x')), ok[1])).rgba], [1, 2, 3, 255]);
  assert.throws(() => decodePng(assemble(ok[0], chunk('1234', Buffer.alloc(0)), ok[1])), /種類名/);
});

test('chunk order and duplicates: PLTE/tRNS before IDAT, IDAT consecutive, no duplicate PLTE/tRNS', () => {
  const plte = chunk('PLTE', Buffer.from([255, 0, 0, 0, 0, 255])), pal = ihdrRaw(2, 1, { colorType: 3 }), px = Buffer.from([0, 0, 1]);
  assert.deepEqual([...decodePng(assemble(pal, plte, idatOf(px))).rgba], [255, 0, 0, 255, 0, 0, 255, 255]);
  assert.throws(() => decodePng(assemble(pal, idatOf(px), plte)), /PLTE はIDATより前/);
  assert.throws(() => decodePng(assemble(pal, plte, plte, idatOf(px))), /PLTEが複数/);
  const z = deflateSync(px), half = [chunk('IDAT', z.subarray(0, 4)), chunk('IDAT', z.subarray(4))];
  assert.deepEqual(decodePng(assemble(pal, plte, ...half)).width, 2, 'IDATを分割しても連続していれば読める');
  assert.throws(() => decodePng(assemble(pal, plte, half[0], chunk('tEXt', Buffer.from('a\0b')), half[1])), /連続していません/);
});

test('tRNS: gray/RGB colour key becomes transparent; tRNS or PLTE that do not fit the colour type are rejected', () => {
  const grayKey = chunk('tRNS', Buffer.from([0, 0x80]));
  const gray = decodePng(assemble(ihdrRaw(2, 1, { colorType: 0 }), grayKey, idatOf(Buffer.from([0, 0x80, 0x10]))));
  assert.deepEqual([...gray.rgba], [0x80, 0x80, 0x80, 0, 0x10, 0x10, 0x10, 255]);
  const rgbKey = chunk('tRNS', Buffer.from([0, 1, 0, 2, 0, 3]));
  const rgb = decodePng(assemble(ihdrRaw(2, 1, { colorType: 2 }), rgbKey, idatOf(Buffer.from([0, 1, 2, 3, 1, 2, 4]))));
  assert.deepEqual([...rgb.rgba], [1, 2, 3, 0, 1, 2, 4, 255]);
  const rgba1 = idatOf(Buffer.from([0, 1, 2, 3, 255]));
  assert.throws(() => decodePng(assemble(ihdrRaw(1, 1), chunk('tRNS', Buffer.from([0, 0])), rgba1)), /tRNSが色の形式と合いません/, 'アルファ付きの形式にtRNS');
  assert.throws(() => decodePng(assemble(ihdrRaw(1, 1, { colorType: 0 }), chunk('tRNS', Buffer.from([0, 0, 0])), idatOf(Buffer.from([0, 9])))), /tRNS/, 'グレーのtRNSは2バイト');
  assert.throws(() => decodePng(assemble(ihdrRaw(1, 1, { colorType: 0 }), chunk('PLTE', Buffer.from([0, 0, 0])), idatOf(Buffer.from([0, 9])))), /PLTEが不正/, 'グレーにPLTE');
  assert.throws(() => decodePng(assemble(ihdrRaw(1, 1, { colorType: 3 }), chunk('PLTE', Buffer.from([0, 0])), idatOf(Buffer.from([0, 0])))), /PLTEが不正/, 'PLTEの長さが3の倍数でない');
});

// 彩度・色の分布（診断情報。点数にはしない）
import { saturationStats, colorHistogram, histogramIntersection } from '../backend/scoring/image-stats.mjs';
const solid = (w, h, [r, g, b]) => ({ width: w, height: h, rgba: Uint8Array.from({ length: w * h * 4 }, (_, i) => [r, g, b, 255][i % 4]) });
const halves = (w, h, left, right) => { const img = solid(w, h, left); for (let y = 0; y < h; y++) for (let x = w / 2; x < w; x++) img.rgba.set([...right, 255], (y * w + x) * 4); return img; };

test('saturation statistics: gray is 0, pure colour is 1, colourfulness orders gray < pastel < vivid', () => {
  const gray = saturationStats(solid(4, 4, [128, 128, 128]), undefined, { step: 1 });
  assert.equal(gray.saturation.mean, 0); assert.equal(gray.highSaturationShare, 0); assert.equal(gray.colorfulness, 0);
  const red = saturationStats(solid(4, 4, [255, 0, 0]), undefined, { step: 1 });
  assert.equal(red.saturation.p50, 1); assert.equal(red.highSaturationShare, 1);
  const pastel = saturationStats(halves(4, 2, [230, 200, 200], [200, 210, 230]), undefined, { step: 1 });
  const vivid = saturationStats(halves(4, 2, [255, 30, 0], [0, 80, 255]), undefined, { step: 1 });
  assert.ok(gray.colorfulness < pastel.colorfulness && pastel.colorfulness < vivid.colorfulness);
  assert.ok(Math.abs(pastel.saturation.mean - ((30 / 230 + 30 / 230) / 2)) < 1e-9);
  assert.equal(saturationStats(solid(2, 2, [1, 2, 3]), { x: 9, y: 9, width: 1, height: 1 }), null);
  assert.throws(() => saturationStats(solid(2, 2, [1, 2, 3]), undefined, { step: 0 }), RangeError);
});

test('colour-distribution overlap does not depend on position and separates different colours', () => {
  const a = halves(8, 4, [255, 0, 0], [0, 0, 255]), swapped = halves(8, 4, [0, 0, 255], [255, 0, 0]); // 左右を入れ替え＝位置だけ違う
  assert.equal(histogramIntersection(colorHistogram(a, undefined, { step: 1 }), colorHistogram(swapped, undefined, { step: 1 })), 1);
  assert.equal(histogramIntersection(colorHistogram(solid(4, 4, [255, 0, 0]), undefined, { step: 1 }), colorHistogram(solid(4, 4, [0, 255, 0]), undefined, { step: 1 })), 0);
  assert.equal(histogramIntersection(colorHistogram(a, undefined, { step: 1 }), colorHistogram(solid(4, 4, [255, 0, 0]), undefined, { step: 1 })), 0.5);
  assert.throws(() => colorHistogram(a, undefined, { bins: 1 }), RangeError);
  assert.throws(() => histogramIntersection(colorHistogram(a, undefined, { bins: 4 }), colorHistogram(a, undefined, { bins: 8 })), RangeError);
});
