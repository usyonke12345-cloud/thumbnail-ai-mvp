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
  const id = 's001', row = { sample_id: id, title: '人工タイトル', genre: 'other', source: 'synthetic', permission: 'own_work', candidate_id: 'c1', generation_version: 'mock-0.1', scoring_version: '0.1.0', reviewer_id: 'r01', preferred_candidate: 'bold', split: splitFor(id) };
  assert.deepEqual(validateRow(row, schema), []);
  assert.ok(validateRow({ ...row, permission: 'none' }, schema).length > 0);
  assert.ok(validateRow({ ...row, reviewer_id: '山田太郎' }, schema).length > 0);
  assert.ok(validateRow({ ...row, extra: 1 }, schema).length > 0);
  assert.equal(splitFor(id), splitFor(id));
  const ids = Array.from({ length: 200 }, (_, i) => `s${String(i).padStart(3, '0')}`);
  const hold = ids.filter(x => splitFor(x) === 'holdout').length;
  assert.ok(hold > 40 && hold < 80, `holdout ratio ${hold}/200`);
});
import { parseCsv, summarize } from '../data/validate.mjs';
test('CSV parsing handles quoted commas and summarize reports invalid rows without titles', async () => {
  const schema = await loadSchema();
  const head = (await read('../data/templates/preferences.template.csv')).trim();
  const ok = (id, extra = '') => `${id},"人工, タイトル",other,synthetic,,own_work,,run1,mock-0.1,0.2.0,r01,bold,bold>clean>contrast,,${splitFor(id)}${extra}`;
  const rows = parseCsv(`${head}\n${ok('s001')}\n${ok('s002').replace('own_work', 'none')}\n`);
  assert.equal(rows[0].title, '人工, タイトル');
  const s = summarize(rows, schema);
  assert.equal(s.rows, 2); assert.equal(s.invalid.length, 1); assert.equal(s.invalid[0].line, 3);
  assert.ok(!JSON.stringify(s).includes('人工'));
  assert.deepEqual(s.progress, { usable: 0, target: 20, status: '未完' }); // syntheticは件数に入らない
  const real = summarize(parseCsv(`﻿${head}\n${ok('s001').replace('synthetic', 'owner')}\n`), schema);
  assert.equal(real.invalid.length, 0, 'BOM付きCSVも読める'); assert.equal(real.progress.usable, 1);
});
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
test('validate CLI runs from a filesystem path (incl. Windows) and prints no titles', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'prefs-'));
  try {
    const head = (await read('../data/templates/preferences.template.csv')).trim();
    const csv = join(dir, 'p.csv');
    await writeFile(csv, `${head}\ns001,"人工タイトル",other,synthetic,,own_work,,run1,mock-0.1,0.2.0,r01,bold,,,${splitFor('s001')}\n`);
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('../data/validate.mjs', import.meta.url)), csv], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).rows, 1);
    assert.ok(!r.stdout.includes('人工'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
