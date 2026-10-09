import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv } from '../data/validate.mjs';
import { readabilitySheet } from '../data/readability-sheet.mjs';
import { loadReadabilitySchema, summarizeReadability } from '../data/readability.mjs';
const manifest = JSON.parse(await readFile(new URL('../docs/readability/manifest.json', import.meta.url), 'utf8'));
const opts = { reviewer: 'r01', os: 'Windows 11', browser: 'Chrome 141, zoom 100%', font: 'Noto Sans JP' };

test('sheet covers every font size × display width, matches the template and leaves human fields blank', async () => {
  const text = readabilitySheet(manifest, opts);
  const template = (await readFile(new URL('../data/templates/readability.template.csv', import.meta.url), 'utf8')).trim();
  assert.equal(text.split('\n')[0], template);
  const rows = parseCsv(text);
  assert.equal(rows.length, manifest.variants.length * manifest.provisionalDisplayWidths.length);
  for (const w of manifest.provisionalDisplayWidths) assert.deepEqual(rows.filter(r => r.display_width === String(w)).map(r => +r.font_size).sort((a, b) => a - b), manifest.variants.map(v => v.fontSize).sort((a, b) => a - b));
  for (const r of rows) {
    assert.deepEqual([r.read_correct, r.seconds, r.rank, r.reason], ['', '', '', '']);
    assert.equal(r.source, 'synthetic'); assert.equal(r.browser, 'Chrome 141, zoom 100%'); // カンマを含む値も壊れない
  }
  // 未記入のままでは集計に使われない（人の記入が必要）
  const s = summarizeReadability(rows, await loadReadabilitySchema());
  assert.equal(s.invalid.length, rows.length); assert.equal(s.byCell.length, 0);
});

test('order within a width depends on the reviewer, and trial ids continue from start', () => {
  const a = parseCsv(readabilitySheet(manifest, opts)), b = parseCsv(readabilitySheet(manifest, { ...opts, reviewer: 'r02', start: 10 }));
  assert.equal(b[0].trial_id, 't010');
  assert.deepEqual(parseCsv(readabilitySheet(manifest, opts)), a, '同じ評価者なら同じ順');
  assert.deepEqual(a.map(r => r.note), b.map(r => r.note), '表示順は各表示幅で1から');
});

test('rejects real names, missing environment and non-synthetic sets', () => {
  assert.throws(() => readabilitySheet(manifest, { ...opts, reviewer: '山田' }));
  assert.throws(() => readabilitySheet(manifest, { ...opts, font: '' }));
  assert.throws(() => readabilitySheet({ ...manifest, source: 'owner' }, opts));
});
