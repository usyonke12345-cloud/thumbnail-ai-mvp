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
