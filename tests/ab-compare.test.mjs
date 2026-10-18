import test from 'node:test';
import assert from 'node:assert/strict';
import { assign, sheetCsv, sheetHtml, signTestP, summarizeAb, FIELDS, chatgptPrompt, conditionErrors, creatorErrors } from '../data/ab-compare.mjs';
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

test('embedded image data cannot close the script tag', () => {
  const html = sheetHtml(assign(['p1'], 'r01'), 'r01', { p1: { source: 'x</script><b>', x: 'a', y: 'b' } }, {});
  assert.equal((html.match(/<\/script>/gi) || []).length, 1);
});

// 回答の行を作る（方法ごとの回答を案X/案Yへ並べ替える）
const ans = { service: { would_use: 'yes', fix: 'text', fix_note: '字体', photo_preserved: 'yes', text_mood_fit: '4' }, chatgpt: { would_use: 'no', fix: 'photo|unwanted', fix_note: '顔が変わる', photo_preserved: 'partly', text_mood_fit: '2' } };
const row = (t, reviewer, preferred, extra = {}) => ({ trial_id: t.trialId, pair_id: t.pairId, reviewer_id: reviewer, ...Object.fromEntries(Object.entries(ans[t.x]).map(([k, v]) => ['x_' + k, v])), ...Object.fromEntries(Object.entries(ans[t.y]).map(([k, v]) => ['y_' + k, v])), preferred, reason: 'r', ...extra });
const pick = (t, m) => (t.x === m ? 'X' : 'Y');

test('summary maps X/Y back to methods, aggregates per-image answers and creator records', () => {
  const key = assign(['p1', 'p2', 'p3', 'p4'], 'r01');
  const rows = [row(key[0], 'r01', pick(key[0], 'service')), row(key[1], 'r01', pick(key[1], 'chatgpt')), row(key[2], 'r01', 'same'), row(key[3], 'r01', 'neither'),
    row(key[0], 'r01', 'X', { x_fix: 'none|text' }), { ...row(key[2], 'r01', 'X'), trial_id: 'ab999' }];
  const meta = { p1: { service: { firstSeconds: 12, revisionsToUsable: 0 }, chatgpt: { firstSeconds: 30, revisionsToUsable: 2 } }, p2: { service: { firstSeconds: 14, revisionsToUsable: 1 }, chatgpt: { firstSeconds: 40, revisionsToUsable: 'gave_up' } } };
  const s = summarizeAb(rows, { r01: key }, meta);
  assert.deepEqual(s.preferred, { service: 1, chatgpt: 1, same: 1, neither: 1 }, '「両方使わない」は「差なし」と別に数える');
  assert.deepEqual(s.invalid.map(x => x.line), [6, 7]);
  const sv = s.byMethod.service, cg = s.byMethod.chatgpt;
  assert.equal(sv.n, 4); assert.equal(sv.wouldUseRate, 1); assert.equal(cg.wouldUseRate, 0);
  assert.equal(sv.fixCounts.text, 4); assert.equal(cg.fixCounts.photo, 4); assert.equal(cg.fixCounts.unwanted, 4);
  assert.deepEqual(cg.photoPreserved, { yes: 0, partly: 4, no: 0 }); assert.equal(sv.textMoodFitMean, 4);
  assert.deepEqual(sv.creator, { firstSecondsMedian: 13, revisionsToUsable: { recorded: 2, median: 0.5, gaveUp: 0 } });
  assert.deepEqual(cg.creator, { firstSecondsMedian: 35, revisionsToUsable: { recorded: 1, median: 2, gaveUp: 1 } });
  assert.equal(s.reasons.find(r => r.pair_id === key[3].pairId).chose, 'neither');
  assert.match(s.note, /参考値/);
});

test('[P2] the same reviewer answering the same pair twice is counted once', () => {
  const key = assign(['p1'], 'r01');
  const rows = Array.from({ length: 20 }, () => row(key[0], 'r01', pick(key[0], 'service')));
  const s = summarizeAb(rows, { r01: key });
  assert.equal(s.trials, 1); assert.equal(s.preferred.service, 1);
  assert.equal(s.invalid.length, 19); assert.ok(s.invalid.every(x => x.errors.some(e => e.includes('重複'))));
});

test('[P2] no pooled p-value across reviewers; per-reviewer tests and pair-level majority instead', () => {
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5'], keys = Object.fromEntries(['r01', 'r02', 'r03'].map(r => [r, assign(ids, r)]));
  const rows = Object.entries(keys).flatMap(([r, key]) => key.map(t => row(t, r, pick(t, 'service'))));
  const s = summarizeAb(rows, keys);
  assert.equal(s.trials, 15); assert.equal(s.preferred.service, 15);
  assert.equal(s.signTestP, undefined, '全票をまとめたp値は出さない'); assert.equal('signTestP' in s.preferred, false);
  assert.deepEqual(Object.keys(s.byReviewer), ['r01', 'r02', 'r03']);
  assert.equal(s.byReviewer.r01.signTestP, 2 / 32, '評価者ごとは5組で5対0');
  assert.deepEqual(s.pairLevel, { service: 5, chatgpt: 0, undecided: 0 }, '組ごとの多数決は5組＝5票');
});

test('[P2] creator records must be a non-negative time and 0-3 revisions (or gave_up); invalid ones are excluded and reported', () => {
  assert.deepEqual(creatorErrors({ service: { firstSeconds: 0, revisionsToUsable: 3 }, chatgpt: { revisionsToUsable: 'gave_up' } }), []);
  for (const bad of [{ service: { firstSeconds: -12 } }, { service: { firstSeconds: Infinity } }, { chatgpt: { revisionsToUsable: 999 } }, { chatgpt: { revisionsToUsable: 1.5 } }, { service: { revisionsToUsable: '2' } }])
    assert.ok(creatorErrors(bad).length > 0, JSON.stringify(bad));
  const key = assign(['p1', 'p2'], 'r01');
  const s = summarizeAb([row(key[0], 'r01', 'same')], { r01: key }, { p1: { service: { firstSeconds: -12, revisionsToUsable: 999 } }, p2: { service: { firstSeconds: 20, revisionsToUsable: 1 } } });
  assert.deepEqual(s.metaInvalid.map(x => x.pair_id), ['p1']);
  assert.deepEqual(s.byMethod.service.creator, { firstSecondsMedian: 20, revisionsToUsable: { recorded: 1, median: 1, gaveUp: 0 } });
});

test('[P1] the ChatGPT prompt is built from the same conditions entered in the service', () => {
  const auto = chatgptPrompt({ title: '初心者の動画編集', brief: '最初の一歩', visualIntent: '落ち着いた雰囲気', headlineMode: 'auto' });
  assert.match(auto, /動画タイトル：「初心者の動画編集」/); assert.match(auto, /動画の内容：最初の一歩/); assert.match(auto, /仕上がりのイメージ：落ち着いた雰囲気/);
  assert.match(auto, /短い見出しを考えて/); assert.doesNotMatch(auto, /タイトルの文字をサムネイルの中に入れて/, 'タイトル全文を入れる指示にしない');
  const manual = chatgptPrompt({ title: 'T', headlineMode: 'manual', headline: '平日ルーティン' });
  assert.match(manual, /サムネイルに入れる文字：「平日ルーティン」/); assert.doesNotMatch(manual, /動画の内容|仕上がりのイメージ/);
  assert.ok(conditionErrors({ title: 'T' }).length > 0, 'headlineMode は必須');
  assert.ok(conditionErrors({ title: 'T', headlineMode: 'manual' }).length > 0, 'manual なら headline 必須');
  assert.throws(() => chatgptPrompt({ title: 'T', headlineMode: 'auto', headline: 'x' }));
});

test('[P1] creating a sheet again never overwrites existing answers', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path'); const { tmpdir } = await import('node:os');
  const { spawnSync } = await import('node:child_process'); const { fileURLToPath } = await import('node:url');
  const dir = await mkdtemp(join(tmpdir(), 'ab-'));
  try {
    await mkdir(join(dir, 'p1'));
    for (const f of ['source.png', 'service.png', 'chatgpt.png']) await writeFile(join(dir, 'p1', f), 'x');
    await writeFile(join(dir, 'p1', 'meta.json'), JSON.stringify({ title: '人工', headlineMode: 'auto' }));
    const cli = fileURLToPath(new URL('../data/ab-compare.mjs', import.meta.url));
    const run = () => spawnSync(process.execPath, [cli, 'sheet', dir, 'r01'], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    const csvPath = join(dir, 'ab-review-r01.csv'), answered = (await readFile(csvPath, 'utf8')) + '記入済み';
    await writeFile(csvPath, answered);
    const again = run();
    assert.notEqual(again.status, 0); assert.match(again.stderr, /既にファイルがあるため作成しません/);
    assert.equal(await readFile(csvPath, 'utf8'), answered, '記入済みのCSVはそのまま');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
