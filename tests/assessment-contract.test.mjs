import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score } from '../backend/scoring/index.mjs';
import { generate } from '../backend/generation/index.mjs';
// 採点の出力を shared/openapi.json の Assessment と照合する契約テスト（契約と実装の食い違いをCIで検出する）。
const read = async p => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const openapi = await read('../shared/openapi.json');
const schema = openapi.components.schemas.Assessment;
const AGREED_WEIGHTS = { contrast: 50, brevity: 30, font: 10, fit: 10 };

/** このリポジトリのスキーマで使う範囲（type・required・additionalProperties・properties・items・enum・const・minimum・maximum・uniqueItems）だけの検証。 */
function validate(value, s, path = '$') {
  const errors = [];
  const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v;
  if (s.type) {
    const types = [s.type].flat(), t = typeOf(value);
    if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) return [`${path}: type ${t} not in ${types}`];
  }
  if ('const' in s && value !== s.const) errors.push(`${path}: not const ${s.const}`);
  if (s.enum && !s.enum.includes(value)) errors.push(`${path}: not in enum`);
  if (typeof value === 'number') {
    if (s.minimum !== undefined && value < s.minimum) errors.push(`${path}: < ${s.minimum}`);
    if (s.maximum !== undefined && value > s.maximum) errors.push(`${path}: > ${s.maximum}`);
  }
  if (Array.isArray(value)) {
    if (s.uniqueItems && new Set(value).size !== value.length) errors.push(`${path}: duplicate items`);
    if (s.items) value.forEach((v, i) => errors.push(...validate(v, s.items, `${path}[${i}]`)));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of s.required ?? []) if (!(k in value)) errors.push(`${path}: missing ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (s.properties?.[k]) errors.push(...validate(v, s.properties[k], `${path}.${k}`));
      else if (s.additionalProperties === false) errors.push(`${path}: unexpected ${k}`);
    }
  }
  return errors;
}

async function candidates() {
  const gen = await read('../docs/fixtures/generation-metadata.json');
  const out = gen.sets.flatMap(s => s.candidates.map(c => [`fixture ${s.input.title} ${c.style}`, c, s.input]));
  for (const c of await generate({ title: '初心者のための動画制作', genre: 'education' })) out.push([`demo ${c.style}`, c, {}]);
  const [base] = out;
  out.push(['画像なし', { ...base[1], imageDataUrl: undefined }, base[2]]);
  out.push(['textLayoutなし（SVG解析）', { ...base[1], metadata: { ...base[1].metadata, textLayout: undefined } }, base[2]]);
  return out;
}

test('the validator itself rejects shapes that break the contract', () => {
  const ok = { overall: 50, overallMax: 100, coverage: 50, unevaluated: ['contrast'], weights: AGREED_WEIGHTS, kind: 'layout_heuristic', version: '0.4.0', metrics: { contrast: null, brevity: 100, font: 100, fit: 100 }, reasons: [], limitations: [] };
  assert.deepEqual(validate(ok, schema), []);
  for (const bad of [{ ...ok, metrics: { ...ok.metrics, fit: 101 } }, { ...ok, metrics: { contrast: 1, brevity: 1, font: 1 } }, { ...ok, unevaluated: ['ctr'] }, { ...ok, extra: 1 }, { ...ok, kind: 'ctr_prediction' }, (({ weights, ...r }) => r)(ok)])
    assert.ok(validate(bad, schema).length > 0, JSON.stringify(bad).slice(0, 80));
});

test('OpenAPI keeps metrics, weights and unevaluated on the same four items', () => {
  const keys = ['contrast', 'brevity', 'font', 'fit'];
  assert.deepEqual(Object.keys(schema.properties.metrics.properties), keys);
  assert.deepEqual(Object.keys(schema.properties.weights.properties), keys);
  assert.deepEqual(schema.properties.unevaluated.items.enum, keys);
});

test('every scored candidate matches the OpenAPI Assessment and the agreed weights', async () => {
  for (const [name, c, input] of await candidates()) {
    const a = await score(c, input);
    assert.deepEqual(validate(a, schema), [], name);
    assert.deepEqual(a.weights, AGREED_WEIGHTS, name);
    // overall / overallMax / coverage が weights と metrics から再計算できること
    const lower = Object.entries(a.metrics).reduce((s, [k, v]) => s + (v ?? 0) * a.weights[k] / 100, 0);
    const missing = a.unevaluated.reduce((s, k) => s + a.weights[k], 0);
    assert.equal(a.overall, Math.round(lower), name); assert.equal(a.overallMax, Math.round(lower + missing), name);
    assert.equal(a.coverage, 100 - missing, name);
  }
  assert.equal(Object.values(AGREED_WEIGHTS).reduce((s, w) => s + w, 0), 100);
});

test('stored fixture assessments (data/fixtures/response.json) match the OpenAPI Assessment', async () => {
  const response = await read('../data/fixtures/response.json');
  for (const c of response.candidates) assert.deepEqual(validate(c.assessment, schema), [], c.style);
});

// 評価済み・一部未評価・全項目未評価の3種類について、契約の形と、null⇔unevaluated・重みに基づく上下限・coverageの整合を確認する。
const svgOf = body => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">${body}</svg>`).toString('base64')}`;
const SOLID = svgOf('<rect width="1280" height="720" fill="#172554"/><text x="80" y="300" font-size="48" fill="#ffffff">動画制作入門</text>');
const OVER_IMAGE = svgOf('<image href="data:image/png;base64,AAAA" width="1280" height="720"/><text x="80" y="300" font-size="48" fill="#ffffff">動画制作入門</text>');
const META = { textLength: 6, lineCount: 1, fontSize: 48, foreground: '#ffffff', background: '#172554' };
const coverageCases = [
  ['全項目評価済み', { imageDataUrl: SOLID, mimeType: 'image/svg+xml', width: 1280, height: 720, metadata: META }, []],
  ['一部未評価（背面が画像）', { imageDataUrl: OVER_IMAGE, mimeType: 'image/svg+xml', width: 1280, height: 720, metadata: META }, ['contrast']],
  ['一部未評価（画像なし）', { metadata: META }, ['contrast', 'fit']],
  ['全項目未評価（画像もmetadataの値も無い）', { metadata: {} }, ['contrast', 'brevity', 'font', 'fit']],
  ['全項目未評価（metadata自体が無い）', {}, ['contrast', 'brevity', 'font', 'fit']],
];
test('evaluated / partly unevaluated / all unevaluated: contract shape, null⇔unevaluated, bounds and coverage from weights', async () => {
  for (const [name, c, expected] of coverageCases) {
    const a = await score(c, {});
    assert.deepEqual(validate(a, schema), [], name);
    assert.deepEqual(a.unevaluated, expected, name);
    for (const k of Object.keys(AGREED_WEIGHTS)) {
      assert.equal(a.metrics[k] === null, expected.includes(k), `${name}: ${k} は未評価のときだけ null`);
      if (a.metrics[k] !== null) assert.ok(Number.isInteger(a.metrics[k]) && a.metrics[k] >= 0 && a.metrics[k] <= 100, `${name}: ${k}`);
    }
    const missing = expected.reduce((s, k) => s + AGREED_WEIGHTS[k], 0);
    assert.equal(a.coverage, 100 - missing, `${name}: coverage`);
    assert.equal(a.overallMax - a.overall, missing, `${name}: 上限−下限＝未評価の重み`);
    assert.ok(a.overall >= 0 && a.overall <= a.overallMax && a.overallMax <= 100, name);
    assert.deepEqual(a.weights, AGREED_WEIGHTS, name);
    if (expected.length === 0) assert.equal(a.overall, a.overallMax, name);
    if (expected.length === 4) assert.deepEqual([a.overall, a.overallMax, a.coverage], [0, 100, 0], name);
  }
});

// 更新前（採点0.3.x）のAssessmentスキーマ。0.4.0の出力はこれに合わない＝契約テストが食い違いを検出できることを確認する。
const PRE_04_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['overall', 'kind', 'version', 'metrics', 'reasons', 'limitations'],
  properties: {
    overall: { type: 'integer', minimum: 0, maximum: 100 }, kind: { const: 'layout_heuristic' }, version: { type: 'string' },
    metrics: { type: 'object', additionalProperties: false, required: ['contrast', 'brevity', 'font'], properties: Object.fromEntries(['contrast', 'brevity', 'font'].map(k => [k, { type: 'integer', minimum: 0, maximum: 100 }])) },
    reasons: { type: 'array', items: { type: 'string' } }, limitations: { type: 'array', items: { type: 'string' } },
  },
};
test('0.4.0 output fails against the pre-update (0.3.x) schema and passes the current one', async () => {
  for (const [name, c] of coverageCases) {
    const a = await score(c, {});
    assert.ok(validate(a, PRE_04_SCHEMA).length > 0, `${name}: 旧スキーマでは失敗する`);
    assert.deepEqual(validate(a, schema), [], `${name}: 新スキーマでは成功する`);
  }
});
