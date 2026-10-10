const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={text:'文字',subject:'人物・素材',composition:'構図',other:'その他'};
const pendingLabels={unknown_input:'入力条件が不明',unavailable_image:'解析できない画像あり',need_multiple_images:'完成画像が1枚のため品質確認のみ',review_missing:'人の記録待ち',stale_review:'案追加後の再確認待ち',reviewer_missing:'評価者の記録待ち'};

// Only receives the normalized dataset produced by createCompleteReviewAnalysis.
// Assets stay beside the page; no image data, API requests or new human records.
export function completePreview(dataset){
 const assets=new Map(dataset.assets.map(asset=>{
  if(!/^[a-f0-9]{64}$/.test(asset.sha256)||asset.path!==`assets/${asset.sha256}.png`)throw new Error('確認ページには固定したPNGの相対パスが必要です。');
  return [asset.assetId,asset];
 }));
 function picture(assetId,role,caption){
  const asset=assets.get(assetId);
  if(!asset)return `<figure><figcaption>${escape(caption)}</figcaption><p>画像なし</p></figure>`;
  if(asset.role!==role)throw new Error('確認ページの画像の役割が一致しません。');
  const diagnostic=asset.diagnostic;
  return `<figure><figcaption>${escape(caption)}</figcaption>${diagnostic?.status==='analyzed'?`<img loading="lazy" src="${escape(asset.path)}" alt="${escape(caption)}"><p>${escape(diagnostic.width)} × ${escape(diagnostic.height)}px</p>`:`<p>PNG診断：未評価</p><p>${escape(diagnostic?.reasons?.join(' / ')??'診断なし')}</p>`}</figure>`;
 }
 const groups=dataset.groups.map(group=>{
  const images=dataset.images.filter(image=>image.groupId===group.id),review=dataset.reviews.find(x=>x.groupId===group.id),pending=dataset.progress.pending.find(x=>x.groupId===group.id);
  const reviewText=review?`<h3>保存された人の記録</h3><p>${review.decision==='none_acceptable'?'全部使わない':images.length===1?'この1枚を選択':'完成案 '+(images.findIndex(x=>x.id===review.imageId)+1)+'を選択'}</p><blockquote>${escape(review.reason)}</blockquote><p>記録された失敗分類：${escape(review.issues.map(x=>labels[x]??x).join(' / ')||'なし')}</p><p>評価者：${escape(review.context?.reviewerId??'未記録')}。このページの閲覧は新しい比較記録になりません。</p>`:'<p>人の記録なし</p>';
  return `<section><h2>${escape(group.input?.title??'タイトル未記録')}</h2><p>内容：${escape(group.input?.brief??'未記録')}</p><p>指定見出し：${escape(group.input?.headline??'未記録')}</p><p class="status">${pending?escape(pendingLabels[pending.reason]??pending.reason):'比較記録あり'}。元写真は比較枚数に含みません。</p><div class="pictures">${picture(group.sourcePhotoAssetId,'source_photo','元写真')}${images.map((image,i)=>`<article class="candidate">${picture(image.assetId,'complete_thumbnail',`完成案 ${i+1}`)}<div class="details"><p>生成時間：${Number.isFinite(image.elapsedMs)?(image.elapsedMs/1000).toFixed(1)+'秒':'未記録'}<br>確認済み実費：${Number.isFinite(image.observation?.costUsd)?escape(image.observation.costUsd)+' USD':'未確認'}<br>PNG保存：${escape(({saved:'確認済み',failed:'失敗',unknown:'未確認'})[image.observation?.pngSave]??'未確認')}</p></div></article>`).join('')}</div>${reviewText}<details><summary>組と画像の情報</summary><p>組ID：${escape(group.id)}</p>${images.map((image,i)=>`<p>完成案 ${i+1}：${escape(image.id)} / ${escape(image.result.generation_version)} / ${escape(image.composition)}</p>`).join('')}</details></section>`;
 }).join('');
 return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>完成PNGの確認</title><style>
:root{font-family:system-ui,sans-serif;color:#182434;background:#f3f5f8;--preview-width:360px}body{margin:0}main{max-width:1200px;margin:auto;padding:24px}h1{font-size:1.7rem}h2{overflow-wrap:anywhere}section{background:white;padding:24px;margin-top:24px;border:1px solid #d6dce5;border-radius:12px}.controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px}button{padding:8px 16px;border:1px solid #8d9aaa;border-radius:6px;background:white;color:#182434;cursor:pointer}button[aria-pressed=true]{background:#223e61;color:white}.pictures{display:flex;flex-wrap:wrap;align-items:flex-start;gap:20px}figure{margin:0;max-width:100%}figcaption{font-weight:700;margin:0 0 8px}img{display:block;width:var(--preview-width);max-width:100%;height:auto;border-radius:4px}figure p,.details{font-size:.85rem;color:#526070}.details{max-width:160px}.status{font-weight:600}p,blockquote{white-space:pre-wrap;overflow-wrap:anywhere}blockquote{margin:12px 0;padding:12px;border-left:4px solid #5476a0;background:#eef3fa}details{margin-top:20px;font-size:.85rem}details p{color:#526070}footer{margin-top:24px;color:#526070}@media(max-width:600px){main{padding:16px}section{padding:16px}.pictures{display:block}figure{margin-bottom:16px}.details{max-width:none}}
.candidate{width:var(--preview-width);max-width:100%}.candidate .details{max-width:none}
</style></head><body><main><h1>元写真と完成PNGを見比べる</h1><p>保存した画像と人のコメントを表示しています。完成画像の品質・文字の正しさ・人物保持は、自動では採点していません。</p><div class="controls" aria-label="画像表示幅"><span>表示幅</span><button type="button" data-width="168" aria-pressed="false">168px</button><button type="button" data-width="246" aria-pressed="false">246px</button><button type="button" data-width="360" aria-pressed="true">360px</button><button type="button" data-width="720" aria-pressed="false">大きく見る</button></div><p>168 / 246 / 360pxは仮の確認幅です。画面が狭い場合は画面幅に合わせます。</p><p>記録のある比較：${escape(dataset.progress.completedHumanComparisons)} / ${escape(dataset.progress.target)}組。1枚の品質確認は含みません。</p>${groups}<footer>${dataset.limitations.map(x=>`<p>${escape(x)}</p>`).join('')}<p>元の記録は同じフォルダーのanalysis.jsonとhuman-reviews.jsonlにあります。画像付きフォルダー全体を非公開で扱ってください。</p></footer></main><script>
const buttons=document.querySelectorAll('[data-width]');for(const button of buttons)button.addEventListener('click',()=>{document.documentElement.style.setProperty('--preview-width',button.dataset.width+'px');for(const other of buttons)other.setAttribute('aria-pressed',String(other===button));});
</script></body></html>`;
}
