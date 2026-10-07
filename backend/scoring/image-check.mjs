// 画像データの欠損・破損・形式の不一致・サイズの確認（依存なし）。画素の解析はしない。
export const EXPECTED = { width: 1280, height: 720 };
const DATA_URL = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/;

function sniff(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) {
    // PNGの先頭のIHDRチャンクから幅と高さを読む
    return buf.toString('latin1', 12, 16) === 'IHDR' ? { type: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : { type: 'image/png', broken: true };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg' }; // 寸法は未確認
  const head = buf.toString('utf8', 0, Math.min(buf.length, 512)).replace(/^﻿/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?<svg\b/.test(head)) {
    const root = /<svg\b([^>]*)>/.exec(buf.toString('utf8'));
    const w = root && /\bwidth="([0-9.]+)"/.exec(root[1]), h = root && /\bheight="([0-9.]+)"/.exec(root[1]);
    return { type: 'image/svg+xml', width: w ? +w[1] : undefined, height: h ? +h[1] : undefined };
  }
  return { type: null };
}

/**
 * 画像を使えるかを確認する。usable=false なら、画像に基づく評価（文字の配置・背面）は行わない。
 * issues は reasons/limitations にそのまま書ける日本語の文。
 */
export function checkImage(candidate) {
  const url = candidate?.imageDataUrl;
  if (typeof url !== 'string' || url === '') return { usable: false, issues: ['画像データがありません。'] };
  const m = DATA_URL.exec(url);
  if (!m || m[2].length % 4 !== 0) return { usable: false, issues: ['画像データの形式（base64のdata URL）が不正です。'] };
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length) return { usable: false, issues: ['画像データが空です。'] };
  const declared = m[1], found = sniff(buf), issues = [];
  if (candidate.mimeType && candidate.mimeType !== declared) return { usable: false, issues: [`mimeType（${candidate.mimeType}）とdata URLの形式（${declared}）が一致しません。`] };
  if (found.type !== declared) return { usable: false, issues: [`画像の中身が宣言された形式（${declared}）と一致しないか、壊れています。`] };
  if (found.broken) return { usable: false, issues: ['PNGのヘッダーが壊れています。'] };
  const { width, height } = found;
  if (width && height) {
    if ((candidate.width && candidate.width !== width) || (candidate.height && candidate.height !== height)) issues.push(`画像の実寸（${width}×${height}）が候補のwidth/height（${candidate.width}×${candidate.height}）と一致しません。`);
    if (width < EXPECTED.width || height < EXPECTED.height) issues.push(`解像度が想定（${EXPECTED.width}×${EXPECTED.height}）より低い（${width}×${height}）ため、縮小・拡大で見え方が変わる可能性があります。`);
    if (Math.abs(width / height - 16 / 9) > 0.01) issues.push(`縦横比が16:9ではありません（${width}×${height}）。`);
  } else issues.push('画像の実寸を確認できませんでした。');
  return { usable: true, type: declared, width, height, issues };
}
