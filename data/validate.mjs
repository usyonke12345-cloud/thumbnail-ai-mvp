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
