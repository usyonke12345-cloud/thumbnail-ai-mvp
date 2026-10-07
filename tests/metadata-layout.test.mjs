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
  assert.equal(a.version, '0.3.1'); assert.equal(a.kind, 'layout_heuristic');
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
test('contrast is unevaluated (0, overall <= 50) unless every title line has a solid backdrop', async () => {
  const solid = await run(cand([el()]));
  const cases = {
    image: cand([el({ textBackdrop: { kind: 'image', color: null } })]),
    unknown: cand([el({ textBackdrop: { kind: 'unknown', color: null } })]),
    invalid: cand([el({ width: -1 })]),
    mixed: cand([el(), el({ id: 'title-1', lineIndex: 1, topY: 320, baselineY: 362, textBackdrop: { kind: 'unknown', color: null } })]),
  };
  for (const [name, c] of Object.entries(cases)) {
    const a = await run(c);
    assert.equal(a.metrics.contrast, 0, name);
    assert.ok(a.overall <= 50, `${name}: overall ${a.overall}`);
    assert.ok(a.overall < solid.overall, name);
    assert.match(all(a), /コントラスト: 未評価/, name); assert.match(all(a), /代用していません/, name);
    assert.doesNotMatch(all(a), /配色のコントラスト比/, name);
  }
  assert.match(all(await run(cases.image)), /背面が画像/); assert.match(all(await run(cases.invalid)), /異常値/);
});
test('unknown background never outranks a confirmed solid backdrop, even a mediocre one', async () => {
  // 背面不明（metadataの配色は最高コントラスト）vs 背面が単色でコントラスト比が低め
  const unknown = await run(cand([el({ textBackdrop: { kind: 'unknown', color: null } })]));
  const mediocre = await run(cand([el({ foreground: '#9ca3af', textBackdrop: { kind: 'solid', color: '#374151' } })]));
  assert.ok(mediocre.metrics.contrast > 0 && mediocre.metrics.contrast < 60);
  assert.ok(unknown.overall < mediocre.overall, `unknown ${unknown.overall} vs solid ${mediocre.overall}`);
});
test('legacy paths without a confirmed solid backdrop (image under title, PNG, unparseable SVG) are unevaluated too', async () => {
  const over = '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><image href="data:image/png;base64,AAAA" width="1280" height="720"/><text x="80" y="300" font-size="48" fill="#ffffff">動画</text></svg>';
  const meta = { textLength: 2, lineCount: 1, fontSize: 48, foreground: '#ffffff', background: '#000000' };
  for (const url of [`data:image/svg+xml;base64,${Buffer.from(over).toString('base64')}`, 'data:image/png;base64,iVBORw0KGgo=']) {
    const a = await run({ imageDataUrl: url, metadata: meta });
    assert.equal(a.metrics.contrast, 0); assert.ok(a.overall <= 50);
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
// 生成側の人工fixture（feature/generation-provider の docs/fixtures/generation-metadata.json）。
// 両ブランチを合わせたときに実行される。単独のブランチではファイルが無いためskipする。
import { readFile } from 'node:fs/promises';
import { elementProblems as problemsOf } from '../backend/scoring/metadata-layout.mjs';
const genFixture = await readFile(new URL('../docs/fixtures/generation-metadata.json', import.meta.url), 'utf8').then(JSON.parse, () => null);
test('generation-side fixture is scored via textLayout and agrees with SVG analysis', { skip: !genFixture && 'generation fixture not on this branch' }, async () => {
  for (const s of genFixture.sets) for (const c of s.candidates) {
    for (const e of c.metadata.textLayout.elements) assert.deepEqual(problemsOf(e), [], `${c.style} ${e.id}`);
    const a = await score(c, s.input);
    assert.match(a.reasons[0], /metadataのtextLayout/); assert.match(all(a), /推定/);
    const { textLayout, ...legacy } = c.metadata;
    const b = await score({ ...c, metadata: legacy }, s.input);
    assert.deepEqual(a.metrics, b.metrics, `${s.input.title} ${c.style}`);
  }
});
