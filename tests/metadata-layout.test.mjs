import test from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../backend/scoring/index.mjs';
import { elementProblems } from '../backend/scoring/metadata-layout.mjs';
// 人工の候補（docs/METADATA-PROPOSAL.md の textLayout v1 形式）。生成側の確定fixtureが届いたら、それでも確認する。
const region = { x: 48, y: 120, width: 1120, height: 460, padding: { top: 16, right: 16, bottom: 16, left: 16 } };
const el = (over = {}) => ({
  id: 'title-0', role: 'title', lineIndex: 0, text: '動画制作入門', x: 80, baselineY: 300, width: 288, height: 52, topY: 258,
  measurement: 'rendered', measurementVersion: 'm1', fontSize: 48, fontFamily: ['sans-serif'], fontWeight: 800, resolvedFontFamily: null,
  foreground: '#ffffff', textRegion: region, textBackdrop: { kind: 'solid', color: '#172554' }, ...over,
});
// 比較用のSVGは、わざと上にはみ出す配置にする（metadataが使われればSVGの結果は出ない）
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#172554"/><text x="80" y="20" font-size="48" fill="#ffffff">動画制作入門</text></svg>';
const cand = (elements, layoutOver = {}) => ({
  imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: 1280, height: 720,
  metadata: { textLength: 6, lineCount: 1, fontSize: 48, foreground: '#ffffff', background: '#172554', generation_version: '0.3.0',
    ...(elements && { textLayout: { version: '1.0.0', coordinateSpace: 'canvas_px', elements, ...layoutOver } }) },
});
const run = c => score(c, {});
const all = a => [...a.reasons, ...a.limitations].join('\n');

test('textLayout v1 is used and named as the evaluation method; contract keys stay the same', async () => {
  const a = await run(cand([el()]));
  assert.equal(a.version, '0.3.0'); assert.equal(a.kind, 'layout_heuristic');
  assert.deepEqual(Object.keys(a.metrics).sort(), ['brevity', 'contrast', 'font']);
  assert.match(a.reasons[0], /評価方法: metadataのtextLayout（v1\.0\.0）/);
  assert.match(all(a), /タイトルは領域内に収まっています/); assert.doesNotMatch(all(a), /推定/);
  assert.match(all(a), /画像内の文字と背面の色/); assert.equal(a.metrics.font, 100);
});
test('estimated measurements are labelled as estimates', async () => {
  const a = await run(cand([el({ measurement: 'estimated' })]));
  assert.match(all(a), /推定で領域内に収まっています/); assert.match(all(a), /生成側の推定値/);
});
test('overflow is judged on all four sides of textRegion', async () => {
  for (const [over, side] of [[{ topY: 130 }, 'top'], [{ topY: 520 }, 'bottom'], [{ x: 60 }, 'left'], [{ x: 870 }, 'right']]) {
    const a = await run(cand([el(over)]));
    assert.match(all(a), /はみ出します/, side); assert.ok(a.metrics.font < 100, side);
  }
  const edge = await run(cand([el({ x: 64, topY: 136 })])); // 余白ちょうど
  assert.match(all(edge), /領域内に収まっています/);
});
test('missing or unknown measurements leave fit unevaluated instead of guessing', async () => {
  for (const over of [{ width: null }, { topY: null }, { measurement: 'unknown', measurementVersion: null }]) {
    const a = await run(cand([el(over)]));
    assert.match(all(a), /収まりは未評価/); assert.doesNotMatch(all(a), /収まっています|はみ出します/);
  }
});
test('invalid elements are unevaluated and NOT backfilled from SVG', async () => {
  for (const over of [{ width: -1 }, { x: 'abc' }, { textBackdrop: { kind: 'solid', color: null } }, { textRegion: { ...region, padding: null } }]) {
    const a = await run(cand([el(over)]));
    assert.match(all(a), /異常値/); assert.match(a.reasons[0], /textLayout/);
    assert.doesNotMatch(all(a), /SVGの構造解析|はみ出します|収まっています/);
  }
  assert.deepEqual(elementProblems(el()), []);
});
test('image or unknown backdrops do not produce a layout contrast', async () => {
  for (const kind of ['image', 'unknown']) {
    const a = await run(cand([el({ textBackdrop: { kind, color: null } })]));
    assert.match(all(a), /コントラストは未評価/); assert.match(all(a), /メタデータの配色/);
  }
});
test('footer role is evaluated separately from the title', async () => {
  const footer = el({ id: 'footer-0', role: 'footer', text: 'LAYOUT', fontSize: 24, topY: 540, height: 26, width: 100, textBackdrop: { kind: 'image', color: null },
    textRegion: { x: 0, y: 520, width: 1280, height: 200, padding: { top: 8, right: 40, bottom: 40, left: 40 } } });
  const a = await run(cand([el(), footer]));
  assert.match(all(a), /背景画像の上にある小さな文字/); assert.equal(a.metrics.font, 100);
});
test('missing textLayout, unknown version or coordinate space fall back to SVG analysis', async () => {
  for (const c of [cand(null), cand([el()], { version: '2.0.0' }), cand([el()], { coordinateSpace: 'normalized' })]) {
    const a = await run(c);
    assert.match(a.reasons[0], /SVGの構造解析/); assert.match(all(a), /はみ出します/);
  }
});
