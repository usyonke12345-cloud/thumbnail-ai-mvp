// PNGの読み込み（Node標準のzlibのみ・依存なし）。採点にはまだ接続していない（画像資産の契約が決まってから使う）。
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAX_INPUT_BYTES = 16 * 1024 * 1024; // 圧縮されたPNG本体の上限（画像資産の案：1画像16MB以下）
export const MAX_PIXELS = 4096 * 4096;           // 展開後の画素数の上限（RGBAで最大64MB）
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export class PngError extends Error {}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

/**
 * PNGをRGBA（各8bit）に展開する。対応：ビット深度8（パレットは1/2/4/8）、インターレースなし。
 * 次の場合は PngError を投げる（呼び出し側は推測せず未評価として扱う）：
 * 署名・CRCの不一致、IHDRが先頭にない、IENDが無い・IENDの後にデータがある、チャンクの途中切れ、
 * 入力や画素数が上限超え、展開後のデータが寸法から計算した長さと一致しない（不足・余分）、対応外の形式。
 * @returns {{ width: number, height: number, rgba: Uint8Array }}
 */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new PngError('PNGの署名がありません');
  if (buf.length > MAX_INPUT_BYTES) throw new PngError(`PNGが大きすぎます（${buf.length}バイト、上限${MAX_INPUT_BYTES}）`);
  let pos = 8, ihdr = null, palette = null, trns = null, ended = false; const idat = [];
  while (pos < buf.length) {
    if (pos + 12 > buf.length) throw new PngError('チャンクの見出しが途中で切れています');
    const len = buf.readUInt32BE(pos), type = buf.toString('latin1', pos + 4, pos + 8);
    if (pos + 12 + len > buf.length) throw new PngError(`チャンク ${type} が途中で切れています`);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (crc32(buf.subarray(pos + 4, pos + 8 + len)) !== buf.readUInt32BE(pos + 8 + len)) throw new PngError(`チャンク ${type} のCRCが一致しません`);
    if (!ihdr && type !== 'IHDR') throw new PngError('IHDRが先頭にありません');
    if (type === 'IHDR') {
      if (ihdr) throw new PngError('IHDRが複数あります');
      if (len !== 13) throw new PngError('IHDRの長さが不正です');
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], colorType: data[9], interlace: data[12] };
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!ihdr) throw new PngError('IHDRがありません');
  if (!ended) throw new PngError('IENDがありません');
  if (pos !== buf.length) throw new PngError(`IENDの後に余分なデータがあります（${buf.length - pos}バイト）`);
  const { width, height, depth, colorType, interlace } = ihdr;
  if (!width || !height || width * height > MAX_PIXELS) throw new PngError(`画像サイズが対応範囲外です（${width}×${height}）`);
  if (!(colorType in CHANNELS)) throw new PngError(`色の形式 ${colorType} は不正です`);
  if (interlace !== 0) throw new PngError('インターレースPNGには未対応です');
  if (colorType === 3 ? ![1, 2, 4, 8].includes(depth) : depth !== 8) throw new PngError(`ビット深度 ${depth}（色の形式 ${colorType}）には未対応です`);
  if (colorType === 3 && !palette) throw new PngError('パレット（PLTE）がありません');
  if (!idat.length) throw new PngError('画像データ（IDAT）がありません');

  const channels = CHANNELS[colorType];
  const bpp = Math.max(1, (channels * depth) >> 3);             // フィルタ計算用の1画素のバイト数
  const stride = Math.ceil((width * channels * depth) / 8);      // 1行のバイト数（フィルタ種別の1バイトを除く）
  const expected = height * (stride + 1);                        // IHDRから計算した展開後のバイト数
  let raw;
  // 展開前に上限をかける：寸法から必要な長さを超えるデータは展開しきる前に止める
  try { raw = inflateSync(Buffer.concat(idat), { maxOutputLength: expected }); }
  catch (e) { throw new PngError(e?.code === 'ERR_BUFFER_TOO_LARGE' ? `展開後のデータが寸法（${width}×${height}）より多すぎます` : '画像データの展開に失敗しました'); }
  if (raw.length !== expected) throw new PngError(`展開後のデータの長さが寸法と一致しません（${raw.length}バイト、必要${expected}バイト）`);

  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride), prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0, b = prev ? prev[i] : 0, c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = src[i]; break;
        case 1: v = src[i] + a; break;
        case 2: v = src[i] + b; break;
        case 3: v = src[i] + ((a + b) >> 1); break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = src[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new PngError(`フィルタ種別 ${filter} は不正です`);
      }
      out[i] = v & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, row = y * stride;
    if (colorType === 3) {
      const bit = x * depth, idx = (px[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      if (idx * 3 + 2 >= palette.length) throw new PngError('パレットの範囲外を参照しています');
      rgba[o] = palette[idx * 3]; rgba[o + 1] = palette[idx * 3 + 1]; rgba[o + 2] = palette[idx * 3 + 2];
      rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      continue;
    }
    const i = row + x * channels;
    if (colorType === 0 || colorType === 4) { rgba[o] = rgba[o + 1] = rgba[o + 2] = px[i]; rgba[o + 3] = colorType === 4 ? px[i + 1] : 255; }
    else { rgba[o] = px[i]; rgba[o + 1] = px[i + 1]; rgba[o + 2] = px[i + 2]; rgba[o + 3] = colorType === 6 ? px[i + 3] : 255; }
  }
  return { width, height, rgba };
}
