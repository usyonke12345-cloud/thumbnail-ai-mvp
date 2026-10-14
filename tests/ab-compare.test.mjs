import test from 'node:test';
import assert from 'node:assert/strict';
import { assign, sheetCsv, sheetHtml, signTestP, summarizeAb, FIELDS } from '../data/ab-compare.mjs';
import { parseCsv } from '../data/validate.mjs';
const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

test('assignment: every pair once, sides are balanced-ish and stable per reviewer, labels never reveal the method', () => {
  const a = assign(ids, 'r01'), b = assign(ids, 'r02');
  assert.deepEqual(a.map(t => t.pairId).sort(), [...ids].sort());
  assert.deepEqual(assign(ids, 'r01'), a, '同じ評価者なら同じ');
  assert.ok(a.every(t => new Set([t.x, t.y]).size === 2 && [t.x, t.y].every(s => ['service', 'chatgpt'].includes(s))));
  assert.ok(a.some(t => t.x === 'service') && a.some(t => t.x === 'chatgpt'), '左右が偏り切らない（この組IDでは）');
  assert.notDeepEqual(a.map(t => t.x), b.map(t => t.x), '評価者ごとに左右が変わる');
  const imgs = Object.fromEntries(ids.map(id => [id, { source: 'data:image/png;base64,QQ==', x: 'data:image/png;base64,QQ==', y: 'data:image/jpeg;base64,QQ==' }]));
  const html = sheetHtml(a, 'r01', imgs, { p1: { title: '<タイトル>', brief: '内容' } });
  assert.doesNotMatch(html, /service|chatgpt|ChatGPT|このサービス/, '方法を表示しない');
  assert.match(html, /&lt;タイトル&gt;/); assert.equal((html.match(/<\/script>/g) || []).length, 1);
  const rows = parseCsv(sheetCsv(a, 'r01'));
  assert.deepEqual(Object.keys(rows[0]), FIELDS); assert.ok(rows.every(r => r.preferred === '' && r.reason === ''));
  assert.throws(() => assign(ids, '山田')); assert.throws(() => assign(['a', 'a'], 'r01')); assert.throws(() => assign(['../x'], 'r01'));
});

test('sign test p-values match the exact binomial', () => {
  assert.equal(signTestP(0, 0), null);
  assert.equal(signTestP(5, 0), 2 / 32);          // 0.0625
  assert.ok(Math.abs(signTestP(4, 1) - 12 / 32) < 1e-12); // 0.375
  assert.equal(signTestP(3, 3), 1);
});

test('summary maps X/Y back through the key, counts ties separately and reports invalid rows', () => {
  const key = assign(['p1', 'p2', 'p3'], 'r01');
  const pick = (t, s) => (t.x === s ? 'X' : 'Y');
  const rows = [
    { trial_id: key[0].trialId, pair_id: key[0].pairId, reviewer_id: 'r01', preferred: pick(key[0], 'service'), would_use_x: 'yes', would_use_y: 'no', reason: '文字がよい' },
    { trial_id: key[1].trialId, pair_id: key[1].pairId, reviewer_id: 'r01', preferred: pick(key[1], 'chatgpt'), would_use_x: 'no', would_use_y: 'no', reason: '' },
    { trial_id: key[2].trialId, pair_id: key[2].pairId, reviewer_id: 'r01', preferred: 'same', would_use_x: 'yes', would_use_y: 'yes', reason: '差がない' },
    { trial_id: 'ab999', pair_id: 'p9', reviewer_id: 'r01', preferred: 'X', would_use_x: 'yes', would_use_y: 'yes', reason: '' },
    { trial_id: key[0].trialId, pair_id: key[0].pairId, reviewer_id: 'r01', preferred: '', would_use_x: '', would_use_y: '', reason: '' },
  ];
  const s = summarizeAb(rows, { r01: key });
  assert.deepEqual(s.preferred, { service: 1, chatgpt: 1, same: 1 });
  assert.deepEqual(s.invalid.map(x => x.line), [5, 6]);
  assert.equal(s.signTestP, 1);
  const svcUse = [key[0], key[1], key[2]].map((t, i) => (t.x === 'service' ? rows[i].would_use_x : rows[i].would_use_y) === 'yes');
  assert.equal(s.wouldUseRate.service, svcUse.filter(Boolean).length / 3);
  assert.equal(s.reasons.find(r => r.pair_id === key[0].pairId).chose, 'service');
  assert.match(s.note, /参考値/);
});
test('embedded image data cannot close the script tag', () => {
  const html = sheetHtml(assign(['p1'], 'r01'), 'r01', { p1: { source: 'x</script><b>', x: 'a', y: 'b' } }, {});
  assert.equal((html.match(/<\/script>/gi) || []).length, 1);
});
