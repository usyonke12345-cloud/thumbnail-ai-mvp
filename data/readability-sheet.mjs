import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const HEADER = 'trial_id,image_set_id,source,generation_version,font_size,display_width,reviewer_id,read_correct,seconds,rank,reason,os,browser,rendered_font,note';
const csv = v => /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

/**
 * 縮小表示テストの記録用シートを作る（評価者ごと）。人が記入する read_correct / seconds / rank / reason は空欄のまま。
 * 同じ表示幅の中で見せる順番は、評価者と表示幅から決まる順に並べ替える（順番の影響を減らすため。note に「表示順」を書く）。
 */
export function readabilitySheet(manifest, { reviewer, os, browser, font, start = 1 }) {
  if (!/^r[0-9]{2,}$/.test(reviewer ?? '')) throw new Error('reviewer は r01 のような仮名にしてください');
  for (const [k, v] of Object.entries({ os, browser, font })) if (!v) throw new Error(`${k} を指定してください（同じPC・ブラウザ・ズーム100%で比較し、実際のフォントを記録します）`);
  if (manifest.source !== 'synthetic') throw new Error('縮小表示テストは人工画像（source=synthetic）だけを使います');
  const sizes = manifest.variants.map(v => v.fontSize), widths = manifest.provisionalDisplayWidths;
  const rows = [HEADER]; let n = start;
  for (const w of widths) {
    const order = [...sizes].sort((a, b) => createHash('sha256').update(`${reviewer}|${w}|${a}`).digest()[0] - createHash('sha256').update(`${reviewer}|${w}|${b}`).digest()[0] || a - b);
    order.forEach((fs, i) => rows.push([`t${String(n++).padStart(3, '0')}`, manifest.setId, 'synthetic', manifest.generationVersion, fs, w, reviewer, '', '', '', '', os, browser, font, `表示順${i + 1}`].map(csv).join(',')));
  }
  return rows.join('\n') + '\n';
}

// 使い方: node data/readability-sheet.mjs r01 "Windows 11" "Chrome 141" "Noto Sans JP" [開始番号] > data/private/readability.csv
if (process.argv[5] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = JSON.parse(await readFile(new URL('../docs/readability/manifest.json', import.meta.url), 'utf8'));
  const [reviewer, os, browser, font, start] = process.argv.slice(2);
  process.stdout.write(readabilitySheet(manifest, { reviewer, os, browser, font, start: start ? Number(start) : 1 }));
}
