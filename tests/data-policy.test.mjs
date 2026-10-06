import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score } from '../backend/scoring/index.mjs';
import { loadSchema, validateRow, splitFor } from '../data/validate.mjs';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
test('scoring fixture cases keep provisional-score invariants', async () => {
  const { cases, invariants } = JSON.parse(await read('../data/fixtures/scoring-cases.json'));
  const results = new Map();
  for (const c of cases) {
    const a = await score({ metadata: c.metadata }, {});
    assert.ok(Number.isInteger(a.overall) && a.overall >= 0 && a.overall <= 100, c.name);
    assert.equal(a.kind, 'layout_heuristic'); assert.ok(a.limitations.length > 0);
    assert.ok(!JSON.stringify(a).includes('CTR予測です'));
    results.set(c.name, a.overall);
  }
  for (const { higher, lower } of invariants) assert.ok(results.get(higher) > results.get(lower), `${higher} > ${lower}`);
});
test('CSV template header matches the schema fields', async () => {
  const schema = await loadSchema();
  const header = (await read('../data/templates/preferences.template.csv')).trim().split(',');
  assert.deepEqual(header, Object.keys(schema.properties));
});
test('row validation and stable holdout split', async () => {
  const schema = await loadSchema();
  const id = 's001', row = { sample_id: id, title: '人工タイトル', genre: 'other', source: 'synthetic', permission: 'own_work', candidate_id: 'c1', generation_version: 'mock-0.1', scoring_version: '0.1.0', reviewer_id: 'r01', preferred_candidate: 'c1', split: splitFor(id) };
  assert.deepEqual(validateRow(row, schema), []);
  assert.ok(validateRow({ ...row, permission: 'none' }, schema).length > 0);
  assert.ok(validateRow({ ...row, reviewer_id: '山田太郎' }, schema).length > 0);
  assert.ok(validateRow({ ...row, extra: 1 }, schema).length > 0);
  assert.equal(splitFor(id), splitFor(id));
  const ids = Array.from({ length: 200 }, (_, i) => `s${String(i).padStart(3, '0')}`);
  const hold = ids.filter(x => splitFor(x) === 'holdout').length;
  assert.ok(hold > 40 && hold < 80, `holdout ratio ${hold}/200`);
});
