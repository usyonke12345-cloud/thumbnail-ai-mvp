import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { score } from '../backend/scoring/index.mjs';

/**
 * 保存したAPIレスポンス（POST /api/v1/thumbnails の成功時JSON）を今の採点versionで採点し直し、
 * scores.csv の行（candidate_id,style,overall,scoring_version,unevaluated）を返す。タイトルは出力しない。
 * unevaluated は採点0.4.0以降の未評価項目を | でつないだもの（0.3.x以前は空）。
 */
export async function rescoreRows(candidateId, response) {
  if (!/^[^,"\r\n]+$/.test(candidateId ?? '')) throw new Error('candidate_id must be non-empty and contain no comma, quote or newline');
  const rows = [];
  for (const c of response.candidates ?? []) {
    const a = await score(c, response.input);
    rows.push([candidateId, c.style, a.overall, a.version, (a.unevaluated ?? []).join('|')].join(','));
  }
  return rows;
}

// 使い方: node data/rescore.mjs <candidate_id> <response.json> >> data/private/scores.csv
if (process.argv[3] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = await rescoreRows(process.argv[2], JSON.parse(await readFile(process.argv[3], 'utf8')));
  console.log(rows.join('\n'));
}
