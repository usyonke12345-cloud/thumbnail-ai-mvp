import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score } from '../backend/scoring/index.mjs';
import { estimateWidth } from '../backend/scoring/layout.mjs';
const { cases } = JSON.parse(await readFile(new URL('../data/fixtures/layout-cases.json', import.meta.url), 'utf8'));
const run = async name => {
  const c = cases.find(x => x.name === name);
  const imageDataUrl = c.dataUrl ?? `data:image/svg+xml;base64,${Buffer.from(c.svg).toString('base64')}`;
  return score({ imageDataUrl, metadata: { textLength: c.textLength, lineCount: c.lineCount, fontSize: c.fontSize, foreground: c.foreground, background: c.background } }, {});
};
const has = (a, s) => [...a.reasons, ...a.limitations].some(x => x.includes(s));
test('version 0.2.1 stays within the v1 Assessment contract', async () => {
  for (const c of cases) {
    const a = await run(c.name);
    assert.equal(a.version, '0.2.1'); assert.equal(a.kind, 'layout_heuristic');
    assert.deepEqual(Object.keys(a.metrics).sort(), ['brevity', 'contrast', 'font']);
    assert.ok(a.limitations.some(x => x.includes('CTR予測や効果保証ではありません')));
  }
});
test('demo and ai_background layouts are scored comparably (no font-size mode penalty)', async () => {
  const demo = await run('demo-20-chars'), ai = await run('ai-20-chars');
  assert.equal(demo.metrics.font, 100); assert.equal(ai.metrics.font, 100);
  assert.equal(demo.overall, ai.overall);
});
test('60-char title fits the panel; oversized lines are flagged', async () => {
  const fit = await run('ai-60-chars'), over = await run('ai-overflow-76px');
  assert.ok(has(fit, '領域内に収まっています'));
  assert.ok(has(over, 'はみ出します'));
  assert.ok(over.metrics.font < fit.metrics.font);
});
test('text over a background image is reported as unevaluated, not guessed', async () => {
  assert.ok(has(await run('ai-20-chars'), '背景画像の上にある小さな文字'));
  assert.ok(!has(await run('demo-20-chars'), '背景画像の上にある小さな文字'));
});
test('contrast uses the panel colour found in the layout', async () => {
  const low = await run('ai-low-contrast'), ok = await run('ai-20-chars');
  assert.ok(low.metrics.contrast < 50 && ok.metrics.contrast === 100);
  assert.ok(has(low, '画像内の文字と背面の色'));
});
test('unparseable or non-SVG images fall back to metadata with a stated limitation', async () => {
  assert.ok(has(await run('unparseable-transform'), '解析できない'));
  assert.ok(has(await run('png-not-svg'), 'SVG以外の画像'));
});
test('width estimate distinguishes full-width and ASCII characters', () => {
  assert.equal(estimateWidth('あいう', 50), 150);
  assert.ok(estimateWidth('abc', 50) < estimateWidth('あいう', 50));
});
test('overflow above the top edge is flagged (canvas and panel)', async () => {
  for (const name of ['top-overflow-canvas', 'top-overflow-panel']) {
    const a = await run(name);
    assert.ok(has(a, 'はみ出します'), name); assert.ok(a.metrics.font < 100, name);
  }
});
test('text partly outside its panel is measured against the panel, not the canvas', async () => {
  const a = await run('partial-panel-overflow');
  assert.ok(has(a, 'はみ出します'));
  assert.ok(has(a, '背面を単色と確認できない'), 'パネルからはみ出した文字のコントラストは推定しない');
  assert.ok(a.metrics.font < 50);
});
