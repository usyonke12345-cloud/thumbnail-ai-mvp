import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewItems, sheetCsv, sheetHtml, FIELDS } from '../data/complete-review-sheet.mjs';
import { parseCsv } from '../data/validate.mjs';
// 人工の analysis（画像本体は使わない）
const analysis = {
  groups: [{ id: 'g1', input: { title: 'T <1>', brief: 'B', sourceSha256: 'a'.repeat(64) } }, { id: 'g2', input: { title: 'T2', brief: 'B2', visualIntent: '穏やか', sourceSha256: 'b'.repeat(64) } }],
  images: [{ id: 'i1', groupId: 'g1', imageSha256: 'c'.repeat(64), result: { generation_version: 'ai-complete-0.1.2' } }, { id: 'i2', groupId: 'g2', imageSha256: 'd'.repeat(64), result: { generation_version: 'ai-complete-0.4.0' } }, { id: 'i3', groupId: 'g1', imageSha256: 'e'.repeat(64), result: { generation_version: 'x' } }],
  assets: [],
};

test('review sheet lists every completed image once, order depends on the reviewer, and hides generation versions', () => {
  const a = reviewItems(analysis, 'r01'), b = reviewItems(analysis, 'r02');
  assert.deepEqual(a.map(x => x.imageId).sort(), ['i1', 'i2', 'i3']);
  assert.deepEqual(a.map(x => x.trialId), ['p001', 'p002', 'p003']);
  assert.deepEqual(reviewItems(analysis, 'r01'), a, '同じ評価者なら同じ順');
  assert.notDeepEqual(a.map(x => x.imageId), b.map(x => x.imageId), 'r01とr02で順番が違う（この人工データでは）');
  const html = sheetHtml(a, 'r01', sha => `data:image/png;base64,${sha.slice(0, 4)}`);
  assert.doesNotMatch(html, /ai-complete|0\.4\.0|0\.1\.2/, '生成版を表示しない');
  assert.match(html, /T &lt;1&gt;/, 'タイトルはエスケープ'); assert.match(html, /穏やか/);
  const rows = parseCsv(sheetCsv(a, 'r01'));
  assert.deepEqual(Object.keys(rows[0]), FIELDS);
  assert.ok(rows.every(r => r.reviewer_id === 'r01' && r.photo_preserved === '' && r.would_use === ''), '判断の欄は空欄');
  assert.throws(() => reviewItems(analysis, '山田'));
});
test('embedded image data cannot close the script tag', () => {
  const html = sheetHtml(reviewItems(analysis, 'r01'), 'r01', () => 'x</script><b>');
  assert.equal((html.match(/<\/script>/gi) || []).length, 1);
});
