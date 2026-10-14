import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { loadSchema, parseCsv, validateRow } from './validate.mjs';
const scoresSchemaUrl = new URL('./schema/scores.schema.json', import.meta.url);
export const loadScoresSchema = async () => JSON.parse(await readFile(scoresSchemaUrl, 'utf8'));
const STYLES = ['bold', 'contrast', 'clean'];
const CLOSE_GAP = 5; // 失敗例の分類用の目安（仮）。点差がこれ未満なら「僅差」

/** scores.csv を candidate_id ごとの {style: overall} にまとめる。不正行・重複・3案そろわない組は報告する。 */
export function collectScores(rows, schema) {
  const invalid = [], sets = new Map();
  rows.forEach((r, i) => {
    const e = validateRow(r, schema);
    const key = `${r.scoring_version}|${r.candidate_id}`;
    const set = sets.get(key) ?? { candidate_id: r.candidate_id, scoring_version: r.scoring_version, scores: {} };
    if (!e.length && r.style in set.scores) e.push('duplicate style for candidate_id/scoring_version');
    if (e.length) { invalid.push({ line: i + 2, errors: e }); return; }
    set.scores[r.style] = Number(r.overall); set.unevaluated = { ...set.unevaluated, [r.style]: r.unevaluated }; sets.set(key, set);
  });
  const complete = [...sets.values()].filter(s => STYLES.every(st => st in s.scores));
  // 3案とも未評価項目が記録されていて、その組み合わせが違う組は、順位を比較しない（採点0.4.0の合意：同じ評価範囲の中だけで比べる）
  const norm = v => String(v).split('|').filter(Boolean).sort().join('|');
  for (const s of complete) s.comparable = !(STYLES.every(st => s.unevaluated?.[st] !== undefined) && new Set(STYLES.map(st => norm(s.unevaluated[st]))).size > 1);
  const incomplete = [...sets.values()].filter(s => !complete.includes(s)).map(s => s.candidate_id);
  return { invalid, complete, incomplete };
}

/** 1行（1人の選好）と1組の点数を比べる。 */
export function compare(pref, scores) {
  const top = Math.max(...STYLES.map(s => scores[s]));
  const tops = STYLES.filter(s => scores[s] === top);
  const top1 = tops.length === 1 ? (tops[0] === pref.preferred_candidate ? 'hit' : 'miss') : (tops.includes(pref.preferred_candidate) ? 'tie' : 'miss');
  const gap = top - scores[pref.preferred_candidate];
  // ranking（a>b>c）があれば3組の対で一致を数える。採点が同点の対は tied。
  let pairs = null;
  const order = pref.ranking ? pref.ranking.split('>') : null;
  if (order && order.length === 3 && STYLES.every(s => order.includes(s))) {
    pairs = { concordant: 0, discordant: 0, tied: 0 };
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const d = scores[order[i]] - scores[order[j]];
      pairs[d > 0 ? 'concordant' : d < 0 ? 'discordant' : 'tied']++;
    }
  }
  const failure = top1 === 'hit' ? null : top1 === 'tie' ? 'score_tie' : gap < CLOSE_GAP ? 'close_miss' : 'clear_miss';
  return { top1, gap, pairs, failure };
}

const rate = (n, d) => d ? Math.round(n / d * 1000) / 1000 : null;
function aggregate(results) {
  const n = results.length, c = k => results.filter(r => r.top1 === k).length;
  const p = results.filter(r => r.pairs).reduce((a, r) => ({ concordant: a.concordant + r.pairs.concordant, discordant: a.discordant + r.pairs.discordant, tied: a.tied + r.pairs.tied }), { concordant: 0, discordant: 0, tied: 0 });
  const pairTotal = p.concordant + p.discordant + p.tied;
  return {
    n, top1_hit: c('hit'), top1_tie: c('tie'), top1_miss: c('miss'),
    top1_hit_rate: rate(c('hit'), n), // 同点（tie）は一致に含めない
    pairwise: pairTotal ? { ...p, concordant_rate: rate(p.concordant, pairTotal) } : null,
  };
}

/**
 * 人の選好（preferences.csv）と採点の順位の一致を集計する。少人数の参考値で、CTRではない。
 * 不正行・permission=none・（既定で）source=synthetic の行は使わない。タイトルは出力しない。
 */
export function summarizeAgreement(prefRows, scoreRows, prefSchema, scoresSchema, { includeSynthetic = false } = {}) {
  const scores = collectScores(scoreRows, scoresSchema);
  const prefInvalid = [], used = [];
  let synthetic = 0;
  prefRows.forEach((r, i) => {
    const e = validateRow(r, prefSchema);
    if (e.length) prefInvalid.push({ line: i + 2, errors: e });
    else if (r.source === 'synthetic' && !includeSynthetic) synthetic++;
    else used.push(r);
  });
  const versions = [...new Set(scores.complete.map(s => s.scoring_version))].sort();
  const byVersion = versions.map(v => {
    const inVersion = scores.complete.filter(s => s.scoring_version === v);
    const sets = new Map(inVersion.filter(s => s.comparable).map(s => [s.candidate_id, s.scores]));
    const incomparable = new Set(inVersion.filter(s => !s.comparable).map(s => s.candidate_id));
    const matched = used.filter(r => sets.has(r.candidate_id));
    const results = matched.map(r => ({ split: r.split, candidate_id: r.candidate_id, preferred: r.preferred_candidate, scores: sets.get(r.candidate_id), ...compare(r, sets.get(r.candidate_id)) }));
    const failures = results.filter(r => r.failure).map(({ candidate_id, split, preferred, scores, gap, failure }) => ({ candidate_id, split, failure, preferred, gap, scores }));
    const count = k => failures.filter(f => f.failure === k).length;
    return {
      scoring_version: v,
      different_coverage: used.filter(r => incomparable.has(r.candidate_id)).length, // 評価範囲が違うため順位比較から除外した選好
      unmatched_preferences: used.filter(r => !sets.has(r.candidate_id) && !incomparable.has(r.candidate_id)).length,
      dev: aggregate(results.filter(r => r.split === 'dev')),
      holdout: aggregate(results.filter(r => r.split === 'holdout')),
      failure_types: { score_tie: count('score_tie'), close_miss: count('close_miss'), clear_miss: count('clear_miss') },
      failures,
    };
  });
  return {
    preferences: { rows: prefRows.length, used: used.length, invalid: prefInvalid, excluded_synthetic: synthetic },
    scores: { invalid: scores.invalid, complete_sets: scores.complete.length, incomplete_sets: scores.incomplete },
    byVersion,
    note: '少人数の参考値。holdoutは重みや閾値の調整に使わない。人の選好の一致でありCTRではない。同点(tie)は一致に含めない。',
  };
}

if (process.argv[3] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const s = summarizeAgreement(parseCsv(await readFile(process.argv[2], 'utf8')), parseCsv(await readFile(process.argv[3], 'utf8')),
    await loadSchema(), await loadScoresSchema(), { includeSynthetic: process.argv.includes('--include-synthetic') });
  console.log(JSON.stringify(s, null, 2));
  process.exitCode = s.preferences.invalid.length || s.scores.invalid.length ? 1 : 0;
}
