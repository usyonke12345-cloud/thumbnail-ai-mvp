import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseCsv, validateRow } from './validate.mjs';
const schemaUrl = new URL('./schema/readability.schema.json', import.meta.url);
export const loadReadabilitySchema = async () => JSON.parse(await readFile(schemaUrl, 'utf8'));
const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const round = (x, d = 2) => x === null ? null : Math.round(x * 10 ** d) / 10 ** d;
/**
 * 縮小表示テストの検証と集計（文字サイズ×表示幅ごと）。少人数の参考値で、CTRではない。
 * 同じ評価者・画像の組・表示幅の中で、順位の重複と文字サイズの重複を不正として報告する。
 */
export function summarizeReadability(rows, schema) {
  const bad = new Map(); const flag = (i, e) => bad.set(i, [...(bad.get(i) ?? []), e]);
  rows.forEach((r, i) => validateRow(r, schema).forEach(e => flag(i, e)));
  const groups = new Map();
  rows.forEach((r, i) => { const k = `${r.reviewer_id}|${r.image_set_id}|${r.display_width}`; groups.set(k, [...(groups.get(k) ?? []), i]); });
  for (const idx of groups.values()) {
    for (const key of ['rank', 'font_size']) {
      const seen = new Set();
      for (const i of idx) { if (seen.has(rows[i][key])) flag(i, `duplicate ${key} in the same reviewer/set/width`); seen.add(rows[i][key]); }
    }
  }
  const ok = rows.filter((_, i) => !bad.has(i));
  const cells = new Map();
  for (const r of ok) { const k = `${r.font_size}px@${r.display_width}`; cells.set(k, [...(cells.get(k) ?? []), r]); }
  const byCell = [...cells].map(([cell, rs]) => {
    const secs = rs.map(r => r.seconds).filter(Boolean).map(Number);
    return {
      cell, font_size: +rs[0].font_size, display_width: +rs[0].display_width, n: rs.length,
      reviewers: new Set(rs.map(r => r.reviewer_id)).size,
      scaled_px: round(+rs[0].font_size * +rs[0].display_width / 1280, 1),
      correct_rate: round(rs.filter(r => r.read_correct === 'yes').length / rs.length),
      median_seconds: round(median(secs)), mean_rank: round(rs.reduce((s, r) => s + +r.rank, 0) / rs.length),
    };
  }).sort((a, b) => a.display_width - b.display_width || a.font_size - b.font_size);
  return {
    rows: rows.length,
    invalid: [...bad].sort((a, b) => a[0] - b[0]).map(([i, errors]) => ({ line: i + 2, errors })),
    reviewers: new Set(ok.map(r => r.reviewer_id)).size,
    byCell,
    note: '少人数の参考値。重みや閾値の決定に単独では使わない。CTRではない。',
  };
}
if (process.argv[2] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = summarizeReadability(parseCsv(await readFile(process.argv[2], 'utf8')), await loadReadabilitySchema());
  console.log(JSON.stringify(s, null, 2)); process.exitCode = s.invalid.length ? 1 : 0;
}
