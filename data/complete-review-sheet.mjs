import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// 完成PNGの人による写真評価シート（ページと記入用CSV）を作る。生成側の analysis.json と assets/ を読む。
// 生成版・作風はわざと表示しない（先入観を避ける）。見せる順は評価者ごとに入れ替える。点数ではなく人の判断の記録。
export const FIELDS = ['trial_id', 'image_id', 'group_id', 'reviewer_id', 'photo_preserved', 'unwanted_elements', 'unwanted_note', 'text_mood_fit', 'color_strength', 'would_use', 'reason'];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const csv = v => /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const order = (reviewer, id) => createHash('sha256').update(`${reviewer}|${id}`).digest('hex');

/** analysis から評価する完成画像の一覧を、評価者ごとの順で返す。 */
export function reviewItems(analysis, reviewer) {
  if (!/^r[0-9]{2,}$/.test(reviewer ?? '')) throw new Error('評価者は r01 のような仮名にしてください');
  const groups = new Map(analysis.groups.map(g => [g.id, g]));
  const shaOf = assetId => analysis.assets.find(a => a.assetId === assetId)?.sha256;
  return analysis.images
    .map(im => { const g = groups.get(im.groupId); return { imageId: im.id, groupId: im.groupId, title: g?.input?.title ?? '', brief: g?.input?.brief ?? '', intent: g?.input?.visualIntent ?? '', sourceSha: g?.input?.sourceSha256 ?? shaOf(g?.sourcePhotoAssetId), imageSha: im.imageSha256 }; })
    .filter(x => x.sourceSha && x.imageSha)
    .sort((a, b) => order(reviewer, a.imageId) < order(reviewer, b.imageId) ? -1 : 1)
    .map((x, i) => ({ ...x, trialId: `p${String(i + 1).padStart(3, '0')}` }));
}

/** 記入用CSV（判断の欄は空欄）。 */
export function sheetCsv(items, reviewer) {
  return [FIELDS.join(','), ...items.map(x => [x.trialId, x.imageId, x.groupId, reviewer, '', '', '', '', '', '', ''].map(csv).join(','))].join('\n') + '\n';
}

/** 評価ページ（画像は dataUrl で埋め込み、1ファイルで開ける。同じ画像は1回だけ埋め込む）。 */
export function sheetHtml(items, reviewer, dataUrlOf) {
  const cards = items.map(x => `<section><h2>${esc(x.trialId)}</h2><p><b>動画タイトル：</b>${esc(x.title)}<br><b>内容：</b>${esc(x.brief)}${x.intent ? `<br><b>仕上がりの希望：</b>${esc(x.intent)}` : ''}</p>
<div class="row"><figure><figcaption>元写真</figcaption><img data-sha="${x.sourceSha}" alt="元写真"></figure><figure><figcaption>完成画像</figcaption><img class="out" data-sha="${x.imageSha}" alt="完成画像"></figure></div></section>`).join('');
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>完成画像の写真評価（${esc(reviewer)}）</title>
<style>:root{--w:360px}body{font-family:sans-serif;margin:16px;color:#111;background:#fff;line-height:1.6}section{border-top:1px solid #ccc;margin:28px 0;padding-top:12px}.row{display:flex;gap:24px;flex-wrap:wrap}figure{margin:0}img{display:block;width:var(--w);max-width:100%;height:auto;border:1px solid #ddd}figcaption{font-size:14px;color:#555}.box{background:#f5f5f5;padding:12px;border-radius:6px}button{margin-right:6px}</style>
<h1>完成画像の写真評価（${esc(reviewer)}）</h1>
<div class="box"><p>完成画像ごとに、記入用CSVの同じ番号（trial_id）の行へ記入してください。生成の版や作風はわざと表示していません。</p>
<ul><li><b>photo_preserved</b>：元写真の人物・場面が保たれているか（yes / partly / no）</li>
<li><b>unwanted_elements</b>：公開すると困る写り込みがあるか（none / present）。present なら <b>unwanted_note</b> に内容（例：他店の広告、電話番号、通行人の顔）</li>
<li><b>text_mood_fit</b>：文字の雰囲気が動画の内容に合っているか（1 合わない 〜 5 とても合う）</li>
<li><b>color_strength</b>：色の強さ（weak 弱い / ok ちょうどよい / strong 強すぎる）</li>
<li><b>would_use</b>：自分の動画ならこのまま使うか（yes / no）</li><li><b>reason</b>：一言の理由（任意）</li></ul>
<p>表示の大きさ：<button data-w="246">246px</button><button data-w="360">360px</button><button data-w="720">大きく</button>（一覧に近い246pxで1回、大きくして1回見るのがおすすめ）</p></div>
${cards}<script>const img=${JSON.stringify(Object.fromEntries([...new Set(items.flatMap(x => [x.sourceSha, x.imageSha]))].map(sha => [sha, dataUrlOf(sha)]))).replace(/</g, '\\u003c')};for(const e of document.querySelectorAll("[data-sha]"))e.src=img[e.dataset.sha];for(const b of document.querySelectorAll('[data-w]'))b.onclick=()=>document.documentElement.style.setProperty('--w',b.dataset.w+'px');</script></html>`;
}

// 使い方: node data/complete-review-sheet.mjs <analysis.json があるフォルダ> r01 <出力フォルダ>
if (process.argv[4] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, reviewer, out] = process.argv.slice(2).map((v, i) => i === 1 ? v : resolve(v));
  const analysis = JSON.parse(await readFile(join(dir, 'analysis.json'), 'utf8'));
  const items = reviewItems(analysis, reviewer);
  const cache = new Map();
  for (const x of items) for (const sha of [x.sourceSha, x.imageSha]) if (!cache.has(sha)) {
    const bytes = await readFile(join(dir, 'assets', `${sha}.png`));
    if (createHash('sha256').update(bytes).digest('hex') !== sha) throw new Error(`画像のSHA-256が一致しません：${sha}`);
    cache.set(sha, `data:image/png;base64,${bytes.toString('base64')}`);
  }
  await writeFile(join(out, `photo-review-${reviewer}.html`), sheetHtml(items, reviewer, sha => cache.get(sha)));
  await writeFile(join(out, `photo-review-${reviewer}.csv`), '﻿' + sheetCsv(items, reviewer));
  console.log(`${items.length}枚の評価シートを作成しました（${reviewer}）`);
}
