import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv } from '../data/validate.mjs';
import { loadReadabilitySchema, summarizeReadability } from '../data/readability.mjs';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
test('readability template header matches the schema fields', async () => {
  const schema = await loadReadabilitySchema();
  const header = (await read('../data/templates/readability.template.csv')).trim().split(',');
  assert.deepEqual(header, Object.keys(schema.properties));
});
test('readability summary groups by font size and display width', async () => {
  const schema = await loadReadabilitySchema();
  const head = (await read('../data/templates/readability.template.csv')).trim();
  const row = (id, fs, w, rev, ok, sec, rank) => `${id},set1,synthetic,mock-0.1,${fs},${w},${rev},${ok},${sec},${rank},,Windows 11,Chrome,Yu Gothic,`;
  const csv = [head,
    row('t001', 48, 168, 'r01', 'no', '3.0', 3), row('t002', 60, 168, 'r01', 'yes', '2.0', 2), row('t003', 76, 168, 'r01', 'yes', '1.0', 1),
    row('t004', 48, 168, 'r02', 'yes', '2.0', 2), row('t005', 60, 168, 'r02', 'yes', '', 3), row('t006', 76, 168, 'r02', 'yes', '1.0', 1),
  ].join('\n');
  const s = summarizeReadability(parseCsv(csv), schema);
  assert.equal(s.invalid.length, 0); assert.equal(s.reviewers, 2);
  const c48 = s.byCell.find(c => c.cell === '48px@168');
  assert.deepEqual({ n: c48.n, correct: c48.correct_rate, med: c48.median_seconds, rank: c48.mean_rank, px: c48.scaled_px }, { n: 2, correct: 0.5, med: 2.5, rank: 2.5, px: 6.3 });
  assert.equal(s.byCell.find(c => c.cell === '60px@168').median_seconds, 2, '空の秒数は除外');
  assert.match(s.note, /参考値/);
  assert.deepEqual(s.environments, ['Windows 11 / Chrome / Yu Gothic']);
});
test('readability rows reject real data, duplicate ranks and bad values', async () => {
  const schema = await loadReadabilitySchema();
  const head = (await read('../data/templates/readability.template.csv')).trim();
  const csv = [head,
    't001,set1,owner,mock-0.1,48,168,r01,yes,,1,,Windows 11,Chrome,Yu Gothic,', // 実データは入れない
    't002,set1,synthetic,mock-0.1,60,168,r01,yes,,2,,Windows 11,Chrome,Yu Gothic,',
    't003,set1,synthetic,mock-0.1,76,168,r01,yes,,2,,Windows 11,Chrome,Yu Gothic,', // 順位の重複（後から出た行を報告）
    't004,set1,synthetic,mock-0.1,76,168,山田,maybe,abc,1,,Windows 11,Chrome,Yu Gothic,',
  ].join('\n');
  const s = summarizeReadability(parseCsv(csv), schema);
  assert.deepEqual(s.invalid.map(x => x.line), [2, 4, 5]);
  assert.ok(s.invalid[1].errors.some(e => e.startsWith('duplicate rank')));
  assert.equal(s.byCell.length, 1, '不正行を除いた t002 だけが集計される');
});
test('readability rows compared in different environments are rejected', async () => {
  const schema = await loadReadabilitySchema();
  const head = (await read('../data/templates/readability.template.csv')).trim();
  const csv = [head,
    't001,synthetic-01,synthetic,readability-fixture-0.1.0,48,168,r01,yes,2.0,2,,Windows 11,Chrome,Yu Gothic,',
    't002,synthetic-01,synthetic,readability-fixture-0.1.0,76,168,r01,yes,1.0,1,,Windows 11,Edge,Yu Gothic,',
    't003,synthetic-01,synthetic,readability-fixture-0.1.0,60,168,r01,yes,1.5,3,,,,,', // 環境の記録なし
  ].join('\n');
  const s = summarizeReadability(parseCsv(csv), schema);
  assert.deepEqual(s.invalid.map(x => x.line), [3, 4]);
  assert.ok(s.invalid[0].errors.some(e => e.includes('differ')));
});
