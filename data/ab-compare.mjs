import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './validate.mjs';

// 「このサービス」と「ChatGPTに直接頼んだもの」の最初の1枚を、どちらか分からない状態で比べる（差別化の仮説A：最初の1枚の使いやすさ）。
// 画像は data/private/ab/<組ID>/ に source.* / service.* / chatgpt.* と meta.json（title, brief, 作成時間・修正回数）を置く。
// 1枚ごとの評価項目は写真評価シート（complete-review-sheet.mjs）と同じ考え方：そのまま使うか・直したい点・写真の保持・文字の雰囲気。
// 比較ページには「案X」「案Y」とだけ出し、どちらが service かは評価者ごとに入れ替える。対応表（key）は評価者に見せない。
export const SIDES = ['service', 'chatgpt'];
export const FIX = ['text', 'photo', 'composition', 'unwanted', 'color', 'other'];
const PER_IMAGE = ['would_use', 'fix', 'fix_note', 'photo_preserved', 'text_mood_fit'];
export const FIELDS = ['trial_id', 'pair_id', 'reviewer_id', ...PER_IMAGE.map(k => 'x_' + k), ...PER_IMAGE.map(k => 'y_' + k), 'preferred', 'reason'];
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csv = v => /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const hash = s => createHash('sha256').update(s).digest();
const reviewerOk = r => /^r[0-9]{2,}$/.test(r ?? '');

/** 評価者ごとの並びと、案X/案Yがどちらかの対応。組の順番と左右は評価者IDから決まる（同じ評価者なら同じ）。 */
export function assign(pairIds, reviewer) {
  if (!reviewerOk(reviewer)) throw new Error('評価者は r01 のような仮名にしてください');
  if (!pairIds.length || new Set(pairIds).size !== pairIds.length || pairIds.some(id => !/^[a-z0-9_-]{1,40}$/i.test(id))) throw new Error('組IDは英数字・-・_ で、重複なしにしてください');
  return [...pairIds]
    .sort((a, b) => Buffer.compare(hash(`${reviewer}|order|${a}`), hash(`${reviewer}|order|${b}`)))
    .map((pairId, i) => ({ trialId: `ab${String(i + 1).padStart(3, '0')}`, pairId, x: hash(`${reviewer}|side|${pairId}`)[0] & 1 ? 'service' : 'chatgpt' }))
    .map(t => ({ ...t, y: t.x === 'service' ? 'chatgpt' : 'service' }));
}

export function sheetCsv(trials, reviewer) {
  return [FIELDS.join(','), ...trials.map(t => [t.trialId, t.pairId, reviewer, ...FIELDS.slice(3).map(() => '')].map(csv).join(','))].join('\n') + '\n';
}

/** 比較ページ。images[pairId] = { source, x, y }（data URL）、meta[pairId] = { title, brief }。service/chatgpt の語は出さない。 */
export function sheetHtml(trials, reviewer, images, meta) {
  const map = {}; const ref = url => { const k = 'i' + Object.keys(map).length; map[k] = url; return k; };
  const cards = trials.map(t => {
    const im = images[t.pairId], m = meta[t.pairId] ?? {};
    return `<section><h2>${esc(t.trialId)}</h2><p><b>動画タイトル：</b>${esc(m.title)}${m.brief ? `<br><b>内容：</b>${esc(m.brief)}` : ''}</p>
<div class="row"><figure><figcaption>元の写真</figcaption><img data-k="${ref(im.source)}" alt="元の写真"></figure><figure><figcaption>案X</figcaption><img class="c" data-k="${ref(im.x)}" alt="案X"></figure><figure><figcaption>案Y</figcaption><img class="c" data-k="${ref(im.y)}" alt="案Y"></figure></div></section>`;
  }).join('');
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>サムネイル比較（${esc(reviewer)}）</title>
<style>:root{--w:320px}body{font-family:sans-serif;margin:16px;color:#111;background:#fff;line-height:1.6}section{border-top:1px solid #ccc;margin:28px 0;padding-top:12px}.row{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}figure{margin:0}img{display:block;width:var(--w);max-width:100%;height:auto;border:1px solid #ddd}img.c{aspect-ratio:16/9;object-fit:contain;background:#f3f3f3}figcaption{font-size:14px;color:#555}.box{background:#f5f5f5;padding:12px;border-radius:6px}button{margin-right:6px}</style>
<h1>サムネイル比較（${esc(reviewer)}）</h1>
<div class="box"><p>同じ写真とタイトルから作った2つの案（案X・案Y）を比べ、記入用CSVの同じ番号の行に書いてください。どちらの方法で作ったかは伏せています。</p>
<p>まず案X・案Yを<b>1枚ずつ</b>評価し（x_ で始まる列が案X、y_ が案Y）、最後にどちらを使うかを選んでください。</p>
<ul><li><b>would_use</b>：手直しなしで、そのまま自分の動画に使うか（yes / no）</li>
<li><b>fix</b>：直したい点。当てはまるものを | でつなぐ（text 文字 / photo 写真・人物の描き直し / composition 構図 / unwanted 困る写り込み / color 色 / other その他）。無ければ none</li>
<li><b>fix_note</b>：直したい点を一言（任意）</li>
<li><b>photo_preserved</b>：元の写真の人物・場面が保たれているか（yes / partly / no）</li>
<li><b>text_mood_fit</b>：文字の雰囲気が動画の内容に合うか（1 合わない 〜 5 とても合う）</li>
<li><b>preferred</b>：自分の動画に使うならどちらか（X / Y / same＝差がない）。<b>reason</b>：その理由を一言</li></ul>
<p>表示の大きさ：<button data-w="246">246px（一覧に近い）</button><button data-w="320">320px</button><button data-w="640">大きく</button></p></div>
${cards}<script>const img=${JSON.stringify(map).replace(/</g, '\\u003c')};for(const e of document.querySelectorAll('[data-k]'))e.src=img[e.dataset.k];for(const b of document.querySelectorAll('[data-w]'))b.onclick=()=>document.documentElement.style.setProperty('--w',b.dataset.w+'px');</script></html>`;
}

/** 両側検定の正確な二項検定（p=0.5）。同点(same)は除く。少数なので参考値。 */
export function signTestP(wins, losses) {
  const n = wins + losses; if (!n) return null;
  const k = Math.min(wins, losses); let c = 1, s = 0;
  for (let i = 0; i <= n; i++) { if (i <= k) s += c; c = c * (n - i) / (i + 1); }
  return Math.min(1, 2 * s / 2 ** n);
}

const median = xs => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };
function rowErrors(r) {
  const e = [];
  for (const side of ['x', 'y']) {
    if (!['yes', 'no'].includes(r[side + '_would_use'])) e.push(side + '_would_use は yes / no');
    const fix = String(r[side + '_fix'] ?? '').split('|').filter(Boolean);
    if (!fix.length || (fix.includes('none') ? fix.length !== 1 : fix.some(f => !FIX.includes(f)))) e.push(side + '_fix は none か ' + FIX.join('|') + ' の組み合わせ');
    if (!['yes', 'partly', 'no'].includes(r[side + '_photo_preserved'])) e.push(side + '_photo_preserved は yes / partly / no');
    if (!/^[1-5]$/.test(r[side + '_text_mood_fit'] ?? '')) e.push(side + '_text_mood_fit は 1〜5');
  }
  if (!['X', 'Y', 'same'].includes(r.preferred)) e.push('preferred は X / Y / same');
  return e;
}

/**
 * 記入済みCSVと対応表から集計する。不正・未記入の行は数えずに報告する。
 * meta[pairId] があれば、作成側の記録（service / chatgpt ごとの firstSeconds・revisionsToUsable）も集計する。
 */
export function summarizeAb(rows, keys, meta = {}) {
  const invalid = [], used = [];
  rows.forEach((r, i) => {
    const key = keys[r.reviewer_id]?.find(t => t.trialId === r.trial_id && t.pairId === r.pair_id);
    const e = [...(reviewerOk(r.reviewer_id) ? [] : ['reviewer_id']), ...(key ? [] : ['trial_id/pair_id が対応表にない']), ...rowErrors(r)];
    if (e.length) invalid.push({ line: i + 2, errors: e }); else used.push({ ...r, key });
  });
  const letterOf = (r, method) => r.key.x === method ? 'x' : 'y';
  const per = method => {
    const v = used.map(r => { const l = letterOf(r, method); return { use: r[l + '_would_use'] === 'yes', fix: r[l + '_fix'].split('|'), photo: r[l + '_photo_preserved'], mood: +r[l + '_text_mood_fit'], note: r[l + '_fix_note'] ?? '' }; });
    const n = v.length, count = f => v.filter(f).length;
    const times = Object.values(meta).map(m => m?.[method]?.firstSeconds), revs = Object.values(meta).map(m => m?.[method]?.revisionsToUsable);
    return {
      n, wouldUseRate: n ? count(x => x.use) / n : null,
      fixCounts: Object.fromEntries([...FIX, 'none'].map(f => [f, count(x => x.fix.includes(f))])),
      photoPreserved: Object.fromEntries(['yes', 'partly', 'no'].map(k => [k, count(x => x.photo === k)])),
      textMoodFitMean: n ? v.reduce((a, x) => a + x.mood, 0) / n : null,
      creator: { firstSecondsMedian: median(times), revisionsToUsable: { recorded: revs.filter(Number.isInteger).length, median: median(revs), gaveUp: revs.filter(x => x === 'gave_up').length } },
    };
  };
  const winsBy = m => used.filter(r => r.preferred !== 'same' && r.key[r.preferred.toLowerCase()] === m).length;
  const service = winsBy('service'), chatgpt = winsBy('chatgpt'), same = used.filter(r => r.preferred === 'same').length;
  return {
    trials: used.length, reviewers: new Set(used.map(r => r.reviewer_id)).size, pairs: new Set(used.map(r => r.pair_id)).size,
    preferred: { service, chatgpt, same }, signTestP: signTestP(service, chatgpt),
    byMethod: { service: per('service'), chatgpt: per('chatgpt') },
    reasons: used.map(r => ({ pair_id: r.pair_id, reviewer_id: r.reviewer_id, chose: r.preferred === 'same' ? 'same' : r.key[r.preferred.toLowerCase()], reason: r.reason, serviceFix: r[letterOf(r, 'service') + '_fix_note'], chatgptFix: r[letterOf(r, 'chatgpt') + '_fix_note'] })),
    invalid,
    note: '少数の人による最初の1枚の比較で、参考値。signTestP は同点を除いた両側二項検定（偶然でも起こりうるかの目安）。作成時間・修正回数は作成者の記録。CTRや品質の保証ではない。',
  };
}

async function loadPairs(dir) {
  const pairs = {}, meta = {};
  for (const entry of (await readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort()) {
    const files = await readdir(join(dir, entry)), find = base => files.find(f => new RegExp(`^${base}\\.(png|jpe?g|webp)$`, 'i').test(f));
    const names = { source: find('source'), service: find('service'), chatgpt: find('chatgpt') };
    if (Object.values(names).some(v => !v)) throw new Error(`${entry}：source / service / chatgpt の画像（png・jpg・webp）がそろっていません`);
    const url = async f => `data:${MIME[f.split('.').pop().toLowerCase()]};base64,${(await readFile(join(dir, entry, f))).toString('base64')}`;
    pairs[entry] = { source: await url(names.source), service: await url(names.service), chatgpt: await url(names.chatgpt) };
    meta[entry] = JSON.parse(await readFile(join(dir, entry, 'meta.json'), 'utf8'));
  }
  return { pairs, meta };
}

// 使い方:
//   シート作成: node data/ab-compare.mjs sheet data/private/ab r01   （ab-review-r01.html / .csv と ab-key-r01.json を同じフォルダに作る）
//   集計:       node data/ab-compare.mjs summarize data/private/ab ab-review-r01.csv [ab-review-r02.csv ...]
if (process.argv[3] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, dirArg, ...rest] = process.argv.slice(2), dir = resolve(dirArg);
  if (cmd === 'sheet') {
    const reviewer = rest[0], { pairs, meta } = await loadPairs(dir), trials = assign(Object.keys(pairs), reviewer);
    const images = Object.fromEntries(trials.map(t => [t.pairId, { source: pairs[t.pairId].source, x: pairs[t.pairId][t.x], y: pairs[t.pairId][t.y] }]));
    await writeFile(join(dir, `ab-review-${reviewer}.html`), sheetHtml(trials, reviewer, images, meta));
    await writeFile(join(dir, `ab-review-${reviewer}.csv`), '﻿' + sheetCsv(trials, reviewer));
    await writeFile(join(dir, `ab-key-${reviewer}.json`), JSON.stringify(trials, null, 2));
    console.log(`${trials.length}組の比較シートを作成しました（${reviewer}）。ab-key-${reviewer}.json は評価者に渡さないでください。`);
  } else if (cmd === 'summarize') {
    const rows = [], keys = {};
    for (const f of rest) {
      const rs = parseCsv(await readFile(join(dir, f), 'utf8')); rows.push(...rs);
      for (const r of new Set(rs.map(x => x.reviewer_id))) if (reviewerOk(r) && !keys[r]) keys[r] = JSON.parse(await readFile(join(dir, `ab-key-${r}.json`), 'utf8'));
    }
    const meta = {};
    for (const entry of (await readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory())) { try { meta[entry.name] = JSON.parse(await readFile(join(dir, entry.name, 'meta.json'), 'utf8')); } catch { /* meta.json の無い組は作成側の記録なし */ } }
    console.log(JSON.stringify(summarizeAb(rows, keys, meta), null, 2));
  } else throw new Error('sheet または summarize を指定してください');
}
