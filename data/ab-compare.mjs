import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './validate.mjs';

// 「このサービス」と「ChatGPTに直接頼んだもの」を、どちらか分からない状態で比べる（差別化の仮説Aの検証）。
// 画像は data/private/ab/<組ID>/ に source.* / service.* / chatgpt.* と meta.json（title, brief）を置く。
// 比較ページには「案X」「案Y」とだけ出し、どちらが service かは評価者ごとに入れ替える。対応表（key）は評価者に見せない。
export const SIDES = ['service', 'chatgpt'];
export const FIELDS = ['trial_id', 'pair_id', 'reviewer_id', 'preferred', 'would_use_x', 'would_use_y', 'reason'];
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
  return [FIELDS.join(','), ...trials.map(t => [t.trialId, t.pairId, reviewer, '', '', '', ''].map(csv).join(','))].join('\n') + '\n';
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
<ul><li><b>preferred</b>：自分の動画に使うならどちらか（X / Y / same＝差がない）</li><li><b>would_use_x / would_use_y</b>：それぞれ、手直しなしでそのまま使うか（yes / no）</li><li><b>reason</b>：選んだ理由を一言（文字・写真・構図・雰囲気など）</li></ul>
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

/** 記入済みCSVと対応表から集計する。不正・未記入の行は数えずに報告する。 */
export function summarizeAb(rows, keys) {
  const invalid = [], used = [];
  rows.forEach((r, i) => {
    const key = keys[r.reviewer_id]?.find(t => t.trialId === r.trial_id && t.pairId === r.pair_id);
    const e = [];
    if (!reviewerOk(r.reviewer_id)) e.push('reviewer_id');
    if (!key) e.push('trial_id/pair_id が対応表にない');
    if (!['X', 'Y', 'same'].includes(r.preferred)) e.push('preferred は X / Y / same');
    for (const k of ['would_use_x', 'would_use_y']) if (!['yes', 'no'].includes(r[k])) e.push(`${k} は yes / no`);
    if (e.length) invalid.push({ line: i + 2, errors: e }); else used.push({ ...r, key });
  });
  const side = (r, letter) => letter === 'X' ? r.key.x : r.key.y;
  const winsBy = s => used.filter(r => r.preferred !== 'same' && side(r, r.preferred) === s).length;
  const service = winsBy('service'), chatgpt = winsBy('chatgpt'), same = used.filter(r => r.preferred === 'same').length;
  const useRate = s => { const v = used.map(r => (r.key.x === s ? r.would_use_x : r.would_use_y) === 'yes'); return v.length ? v.filter(Boolean).length / v.length : null; };
  return {
    trials: used.length, reviewers: new Set(used.map(r => r.reviewer_id)).size, pairs: new Set(used.map(r => r.pair_id)).size,
    preferred: { service, chatgpt, same }, signTestP: signTestP(service, chatgpt),
    wouldUseRate: { service: useRate('service'), chatgpt: useRate('chatgpt') },
    reasons: used.map(r => ({ pair_id: r.pair_id, reviewer_id: r.reviewer_id, chose: r.preferred === 'same' ? 'same' : side(r, r.preferred), reason: r.reason })),
    invalid,
    note: '少数の人による好みの比較で、参考値。signTestP は同点を除いた両側二項検定（偶然でも起こりうるかの目安）。CTRや品質の保証ではない。',
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
    console.log(JSON.stringify(summarizeAb(rows, keys), null, 2));
  } else throw new Error('sheet または summarize を指定してください');
}
