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
  assert.deepEqual(Object.keys(rows[0]), FIELDS); assert.ok(rows.every(r => Object.entries(r).every(([k, v]) => ['trial_id', 'pair_id', 'reviewer_id'].includes(k) || v === '')), '判断の欄は空欄');
  assert.throws(() => assign(ids, '山田')); assert.throws(() => assign(['a', 'a'], 'r01')); assert.throws(() => assign(['../x'], 'r01'));
});

test('sign test p-values match the exact binomial', () => {
  assert.equal(signTestP(0, 0), null);
  assert.equal(signTestP(5, 0), 2 / 32);          // 0.0625
  assert.ok(Math.abs(signTestP(4, 1) - 12 / 32) < 1e-12); // 0.375
  assert.equal(signTestP(3, 3), 1);
});

test('summary maps X/Y back to methods, aggregates per-image answers and creator records, and reports invalid rows', () => {
  const key = assign(['p1', 'p2', 'p3'], 'r01');
  // 方法ごとの回答を作り、案X/案Yへ並べ替える（service は使える・文字だけ直したい、chatgpt は使えない・写真の描き直しと写り込み）
  const ans = { service: { would_use: 'yes', fix: 'text', fix_note: '字体', photo_preserved: 'yes', text_mood_fit: '4' }, chatgpt: { would_use: 'no', fix: 'photo|unwanted', fix_note: '顔が変わる', photo_preserved: 'partly', text_mood_fit: '2' } };
  const row = (t, preferred, extra = {}) => ({ trial_id: t.trialId, pair_id: t.pairId, reviewer_id: 'r01', ...Object.fromEntries(Object.entries(ans[t.x]).map(([k, v]) => ['x_' + k, v])), ...Object.fromEntries(Object.entries(ans[t.y]).map(([k, v]) => ['y_' + k, v])), preferred, reason: 'r', ...extra });
  const pick = (t, m) => (t.x === m ? 'X' : 'Y');
  const rows = [row(key[0], pick(key[0], 'service')), row(key[1], pick(key[1], 'chatgpt')), row(key[2], 'same'),
    row(key[0], 'X', { x_fix: 'none|text' }), row(key[1], 'X', { y_text_mood_fit: '6' }), { ...row(key[2], 'X'), trial_id: 'ab999' }];
  const meta = { p1: { service: { firstSeconds: 12, revisionsToUsable: 0 }, chatgpt: { firstSeconds: 30, revisionsToUsable: 2 } }, p2: { service: { firstSeconds: 14, revisionsToUsable: 1 }, chatgpt: { firstSeconds: 40, revisionsToUsable: 'gave_up' } } };
  const s = summarizeAb(rows, { r01: key }, meta);
  assert.deepEqual(s.preferred, { service: 1, chatgpt: 1, same: 1 });
  assert.deepEqual(s.invalid.map(x => x.line), [5, 6, 7], 'none と他の併記・範囲外の点数・対応表にない行');
  const sv = s.byMethod.service, cg = s.byMethod.chatgpt;
  assert.equal(sv.n, 3); assert.equal(sv.wouldUseRate, 1); assert.equal(cg.wouldUseRate, 0);
  assert.equal(sv.fixCounts.text, 3); assert.equal(cg.fixCounts.photo, 3); assert.equal(cg.fixCounts.unwanted, 3); assert.equal(sv.fixCounts.none, 0);
  assert.deepEqual(cg.photoPreserved, { yes: 0, partly: 3, no: 0 }); assert.equal(sv.textMoodFitMean, 4);
  assert.deepEqual(sv.creator, { firstSecondsMedian: 13, revisionsToUsable: { recorded: 2, median: 0.5, gaveUp: 0 } });
  assert.deepEqual(cg.creator, { firstSecondsMedian: 35, revisionsToUsable: { recorded: 1, median: 2, gaveUp: 1 } });
  assert.equal(s.reasons.find(r => r.pair_id === key[0].pairId).chose, 'service');
  assert.equal(s.reasons[0].chatgptFix, '顔が変わる');
  assert.match(s.note, /参考値/);
});
test('embedded image data cannot close the script tag', () => {
  const html = sheetHtml(assign(['p1'], 'r01'), 'r01', { p1: { source: 'x</script><b>', x: 'a', y: 'b' } }, {});
  assert.equal((html.match(/<\/script>/gi) || []).length, 1);
});
