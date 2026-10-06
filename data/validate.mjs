import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const schemaUrl = new URL('./schema/sample.schema.json', import.meta.url);
export const loadSchema = async () => JSON.parse(await readFile(schemaUrl, 'utf8'));
/** Stable dev/holdout split: about 30% holdout, decided only by sample_id. */
export function splitFor(sampleId) {
  return createHash('sha256').update(sampleId).digest()[0] < 77 ? 'holdout' : 'dev';
}
/** Minimal validator for the schema subset used here. Returns a list of error strings. */
export function validateRow(row, schema) {
  const errors = [];
  for (const key of Object.keys(row)) if (!(key in schema.properties)) errors.push(`unknown field: ${key}`);
  for (const key of schema.required) if (row[key] === undefined || row[key] === '') errors.push(`missing: ${key}`);
  for (const [key, rule] of Object.entries(schema.properties)) {
    const v = row[key]; if (v === undefined || v === '') continue;
    if (rule.enum && !rule.enum.includes(v)) errors.push(`${key}: not in enum`);
    if (rule.pattern && !new RegExp(rule.pattern).test(v)) errors.push(`${key}: pattern`);
    if (rule.maxLength && [...v].length > rule.maxLength) errors.push(`${key}: too long`);
  }
  if (row.permission === 'none') errors.push('permission=none rows must not be used');
  if (row.sample_id && row.split && splitFor(row.sample_id) !== row.split) errors.push('split does not match sample_id');
  if (row.ranking && !row.ranking.split('>').includes(row.preferred_candidate)) errors.push('preferred_candidate not in ranking');
  return errors;
}
/** 引用符つきCSVの最小パーサ（タイトルにカンマを含められる）。 */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); if (row.some(x => x !== '')) rows.push(row); }
  const [header = [], ...body] = rows;
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
/** 記録表の検証と集計。タイトルや個人情報は出力しない。 */
export function summarize(rows, schema) {
  const bad = []; const count = (k) => rows.reduce((m, r) => (m[r[k] || '(空)'] = (m[r[k] || '(空)'] ?? 0) + 1, m), {});
  rows.forEach((r, i) => { const e = validateRow(r, schema); if (e.length) bad.push({ line: i + 2, errors: e }); });
  return { rows: rows.length, invalid: bad, samples: new Set(rows.map(r => r.sample_id)).size, byGenre: count('genre'), bySplit: count('split'), byPreferred: count('preferred_candidate'), byPermission: count('permission') };
}
if (process.argv[1] === new URL(import.meta.url).pathname && process.argv[2]) {
  const s = summarize(parseCsv(await readFile(process.argv[2], 'utf8')), await loadSchema());
  console.log(JSON.stringify(s, null, 2)); process.exitCode = s.invalid.length ? 1 : 0;
}
