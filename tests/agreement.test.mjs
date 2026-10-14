import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSchema, parseCsv, splitFor } from '../data/validate.mjs';
import { compare, loadScoresSchema, summarizeAgreement } from '../data/agreement.mjs';
import { rescoreRows } from '../data/rescore.mjs';
const read = p => readFile(new URL(p, import.meta.url), 'utf8');
// 人工データのみ。sample_id は split が dev / holdout になるものを選ぶ。
const ids = Array.from({ length: 50 }, (_, i) => `s${String(i + 1).padStart(3, '0')}`);
const devIds = ids.filter(id => splitFor(id) === 'dev'), holdIds = ids.filter(id => splitFor(id) === 'holdout');
const pref = (id, cid, preferred, ranking = '', source = 'owner') =>
  `${id},"人工タイトル",other,${source},,owner_consented,2026-10-07,${cid},0.3.2,0.3.1,r01,${preferred},${ranking},,${splitFor(id)}`;
const scoreRows = (cid, b, c, l, v = '0.3.1') => [`${cid},bold,${b},${v}`, `${cid},contrast,${c},${v}`, `${cid},clean,${l},${v}`];

test('compare separates hits, ties and misses and classifies failures', () => {
  assert.deepEqual(compare({ preferred_candidate: 'bold' }, { bold: 90, contrast: 80, clean: 70 }).top1, 'hit');
  const tie = compare({ preferred_candidate: 'bold' }, { bold: 90, contrast: 90, clean: 70 });
  assert.equal(tie.top1, 'tie'); assert.equal(tie.failure, 'score_tie');
  assert.equal(compare({ preferred_candidate: 'clean' }, { bold: 90, contrast: 80, clean: 88 }).failure, 'close_miss');
  assert.equal(compare({ preferred_candidate: 'clean' }, { bold: 90, contrast: 80, clean: 50 }).failure, 'clear_miss');
  const p = compare({ preferred_candidate: 'bold', ranking: 'bold>clean>contrast' }, { bold: 90, contrast: 90, clean: 70 }).pairs;
  assert.deepEqual(p, { concordant: 1, discordant: 1, tied: 1 }); // bold>clean ○, bold=contrast 同点, clean<contrast ×
});

test('agreement summary splits dev/holdout, excludes synthetic and prints no titles', async () => {
  const [ps, ss] = [await loadSchema(), await loadScoresSchema()];
  const ph = (await read('../data/templates/preferences.template.csv')).trim(), sh = (await read('../data/templates/scores.template.csv')).trim();
  const prefs = [ph,
    pref(devIds[0], 'c1', 'bold', 'bold>contrast>clean'), // hit
    pref(devIds[1], 'c2', 'clean'),                         // clear miss
    pref(devIds[2], 'c3', 'contrast'),                      // tie
    pref(holdIds[0], 'c4', 'bold'),                         // hit (holdout)
    pref(devIds[3], 'c1', 'bold', '', 'synthetic'),         // 既定で除外
    pref(devIds[4], 'c9', 'bold'),                          // 点数なし
  ].join('\n');
  const scores = [sh, ...scoreRows('c1', 90, 80, 70), ...scoreRows('c2', 90, 85, 50), ...scoreRows('c3', 100, 100, 72), ...scoreRows('c4', 95, 60, 60)].join('\n');
  const s = summarizeAgreement(parseCsv(prefs), parseCsv(scores), ps, ss);
  assert.equal(s.preferences.used, 5); assert.equal(s.preferences.excluded_synthetic, 1);
  const [v] = s.byVersion;
  assert.equal(v.scoring_version, '0.3.1'); assert.equal(v.unmatched_preferences, 1);
  assert.deepEqual({ n: v.dev.n, hit: v.dev.top1_hit, tie: v.dev.top1_tie, miss: v.dev.top1_miss, rate: v.dev.top1_hit_rate }, { n: 3, hit: 1, tie: 1, miss: 1, rate: 0.333 });
  assert.deepEqual(v.dev.pairwise, { concordant: 3, discordant: 0, tied: 0, concordant_rate: 1 });
  assert.equal(v.holdout.n, 1); assert.equal(v.holdout.top1_hit, 1);
  assert.deepEqual(v.failure_types, { score_tie: 1, close_miss: 0, clear_miss: 1 });
  assert.ok(!JSON.stringify(s).includes('人工タイトル')); assert.match(s.note, /参考値/);
  const withSyn = summarizeAgreement(parseCsv(prefs), parseCsv(scores), ps, ss, { includeSynthetic: true });
  assert.equal(withSyn.byVersion[0].dev.n, 4);
});

test('score rows: invalid values, duplicate styles and incomplete sets are reported, versions kept apart', async () => {
  const [ps, ss] = [await loadSchema(), await loadScoresSchema()];
  const sh = (await read('../data/templates/scores.template.csv')).trim();
  const scores = [sh, ...scoreRows('c1', 90, 80, 70), 'c1,bold,50,0.3.1', 'c2,bold,101,0.3.1', 'c3,bold,90,0.3.1', ...scoreRows('c1', 70, 80, 90, '0.4.0')].join('\n');
  const s = summarizeAgreement([], parseCsv(scores), ps, ss);
  assert.deepEqual(s.scores.invalid.map(x => x.line), [5, 6]);
  assert.deepEqual(s.scores.incomplete_sets, ['c3']);
  assert.deepEqual(s.byVersion.map(v => v.scoring_version), ['0.3.1', '0.4.0']);
});

test('rescore turns a saved API response into scores.csv rows with the current version', async () => {
  const response = JSON.parse(await read('../data/fixtures/response.json'));
  const rows = await rescoreRows('run-001', response);
  assert.equal(rows.length, 3);
  for (const r of rows) assert.match(r, /^run-001,(bold|contrast|clean),\d{1,3},\d+\.\d+\.\d+,((contrast|brevity|font|fit)(\|(contrast|brevity|font|fit))*)?$/);
  assert.ok(!rows.join('\n').includes(response.input.title));
  await assert.rejects(rescoreRows('a,b', response));
});

test('sets whose candidates differ in unevaluated items are excluded from ranking comparison (0.4.0 agreement)', async () => {
  const [ps, ss] = [await loadSchema(), await loadScoresSchema()];
  const sh = (await read('../data/templates/scores.template.csv')).trim();
  const prefs = [(await read('../data/templates/preferences.template.csv')).trim(), pref(devIds[0], 'same', 'bold'), pref(devIds[1], 'mixed', 'clean'), pref(devIds[2], 'old', 'bold')].join('\n');
  const scores = [sh,
    'same,bold,90,0.4.0,contrast', 'same,contrast,80,0.4.0,contrast', 'same,clean,70,0.4.0,contrast',  // 同じ評価範囲 → 比較する
    'mixed,bold,90,0.4.0,', 'mixed,contrast,50,0.4.0,contrast', 'mixed,clean,40,0.4.0,contrast|fit', // 評価範囲が違う → 比較しない
    'old,bold,90,0.4.0', 'old,contrast,80,0.4.0', 'old,clean,70,0.4.0',                              // 列なし（生成側CSVの4列形式）→ 比較する
  ].join('\n');
  const s = summarizeAgreement(parseCsv(prefs), parseCsv(scores), ps, ss);
  assert.deepEqual(s.scores.invalid, []);
  const [v] = s.byVersion;
  assert.equal(v.different_coverage, 1); assert.equal(v.unmatched_preferences, 0);
  assert.equal(v.dev.n, 2); assert.equal(v.dev.top1_hit, 2);
  assert.ok(!v.failures.some(f => f.candidate_id === 'mixed'));
  const bad = summarizeAgreement([], parseCsv([sh, 'x,bold,90,0.4.0,ctr'].join('\n')), ps, ss);
  assert.equal(bad.scores.invalid.length, 1);
});
