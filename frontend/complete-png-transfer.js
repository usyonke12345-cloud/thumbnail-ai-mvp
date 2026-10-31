import {referenceContextText} from '../shared/thumbnail-references.mjs';
import {feedbackText} from './feedback-memory.js';
import {validateSubjectRegions,subjectRegionsText} from './subject-regions.js';
import {createEntry,createLegacyEntry,comparisonBundle,validateQualityReview,validateObservation,validateReviewContext,MAX_IMAGES,MAX_GROUP_IMAGES,projectName,revisionChecks} from './complete-gallery-model.js';
import {writeZip} from './local-archive.js';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=url=>Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));
const fail=message=>{throw new Error(message);};
const sameInput=(a,b)=>a===null?b===null:!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&(Array.isArray(a[k])?Array.isArray(b[k])&&JSON.stringify(a[k])===JSON.stringify(b[k]):a[k]===b[k]));
export const MAX_IMPORT_BYTES=70*1024*1024;

// Verify frozen identities again; exported summaries and imported diagnostics are not trusted.
export async function validateCompleteBundle(value){
 if(!value||!['complete-comparison-1.0.0','complete-comparison-1.1.0','complete-comparison-1.2.0','complete-comparison-1.3.0','complete-comparison-1.4.0','complete-comparison-1.5.0','complete-comparison-1.6.0','complete-comparison-1.7.0','complete-comparison-1.8.0','complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version)||value.kind!=='human_quality_review'||value.assessment!==null||!value.group||!Array.isArray(value.images)||!value.images.length||value.images.length>MAX_GROUP_IMAGES)fail('完成PNGの比較JSONの版・件数が不正です。');
 if(value.images.some(x=>x.referenceMode!==undefined||x.result?.referenceContext!==undefined)&&!['complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('参考資料の記録には比較形式1.9.0が必要です。');
 if(value.images.some(x=>x.result?.validationA)&&!['complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('A検証の照合記録には比較形式1.10.0が必要です。');
 const group=value.group,images=[];
 if((group.additionalImageDataUrls?.length===3||value.images.some(x=>x.result?.sourcePhotoSha256s?.length===4))&&value.version!=='complete-comparison-1.12.0')fail('4枚写真には比較形式1.12.0が必要です。');let normalizedInput=null;
 if((group.additionalImageDataUrls!==undefined||group.input?.additionalSourceSha256s!==undefined||value.images.some(x=>x.result?.sourcePhotoSha256s))&&!['complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('複数写真には比較形式1.11.0が必要です。');
 if(group.input===null&&value.images.some(x=>x.feedbackContext!==undefined))fail('入力が不明な以前の画像に送信時の評価メモは付けられません。');
 if(value.images.some(x=>x.feedbackContext!==undefined||x.result?.feedbackApplied!==undefined)&&!['complete-comparison-1.8.0','complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('生成時の評価メモには比較形式1.8.0が必要です。');
 if(value.images.some(x=>x.subjectRegions!==undefined)&&!['complete-comparison-1.7.0','complete-comparison-1.8.0','complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('人物範囲の記録には比較形式1.7.0が必要です。');
 if(value.images.length>6&&!['complete-comparison-1.6.0','complete-comparison-1.7.0','complete-comparison-1.8.0','complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('7枚以上の組には比較形式1.6.0が必要です。');if(group.input===null&&value.images.some(x=>x.revision))fail('入力写真が不明な画像の修正元は復元できません。');
 if((group.projectName!==undefined||value.images.some(x=>x.revision||x.result?.revision))&&!['complete-comparison-1.6.0','complete-comparison-1.7.0','complete-comparison-1.8.0','complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('案件名と修正の参照には比較形式1.6.0が必要です。');
 if(!['complete-comparison-1.3.0','complete-comparison-1.4.0','complete-comparison-1.5.0','complete-comparison-1.6.0','complete-comparison-1.7.0','complete-comparison-1.8.0','complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version)&&(group.input?.headlineMode!==undefined||value.images.some(x=>x.design!==undefined)))fail('自動見出しとデザイン指定には比較形式1.3.0以上が必要です。');
 if(group.input?.visualIntent!==undefined&&!['complete-comparison-1.4.0','complete-comparison-1.5.0','complete-comparison-1.6.0','complete-comparison-1.7.0','complete-comparison-1.8.0','complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('仕上がりのイメージには比較形式1.4.0以上が必要です。');
 if(group.input?.brief===''&&!['complete-comparison-1.5.0','complete-comparison-1.6.0','complete-comparison-1.7.0','complete-comparison-1.8.0','complete-comparison-1.9.0','complete-comparison-1.10.0','complete-comparison-1.11.0','complete-comparison-1.12.0'].includes(value.version))fail('補足なしの入力には比較形式1.5.0が必要です。');
 for(const image of value.images){
  if(images.some(x=>x.id===image.id))fail('完成画像IDが重複しています。');
  const options={id:image.id,capturedAt:image.capturedAt,elapsedMs:image.elapsedMs,...(image.revision?{revision:image.revision}:{})};
  const entry=group.input===null?await createLegacyEntry(image.result,options):await createEntry({...group.input,imageDataUrl:group.sourceImageDataUrl,...(group.additionalImageDataUrls!==undefined?{additionalImageDataUrls:group.additionalImageDataUrls}:{}),composition:image.composition,...(image.referenceMode!==undefined?{referenceMode:image.referenceMode}:{}),...(image.design!==undefined?{design:image.design}:{}),...(image.feedbackContext!==undefined?{feedback:image.feedbackContext}:{})},image.result,options);
  if(entry.group.id!==group.id||entry.group.sourceImageDataUrl!==group.sourceImageDataUrl||JSON.stringify(entry.group.additionalImageDataUrls)!==JSON.stringify(group.additionalImageDataUrls)||entry.image.groupId!==image.groupId||entry.image.imageSha256!==image.imageSha256||!sameInput(entry.group.input,group.input)||entry.image.composition!==image.composition||entry.image.design!==image.design||entry.image.referenceMode!==image.referenceMode||entry.image.elapsedMs!==image.elapsedMs||image.version!==1)fail('画像・入力条件・組ID・SHA-256が一致しません。');
  normalizedInput=entry.group.input;
  if(image.result.width!==entry.image.result.width||image.result.height!==entry.image.result.height)fail('宣言寸法とPNGの寸法が一致しません。');
  images.push({...entry.image,...(image.subjectRegions!==undefined?{subjectRegions:validateSubjectRegions(image.subjectRegions,entry.group,entry.image)}:{}),...(image.observation?{observation:validateObservation(image.observation)}:{})});
 }
 if(group.version!==1||typeof group.capturedAt!=='string'||!Number.isFinite(Date.parse(group.capturedAt)))fail('比較組の保存時刻が不正です。');
 let review=value.review??null;
 if(review){const covered=images.filter(x=>review.displayWidths?.some(w=>w.imageId===x.id));if(!covered.length)fail('比較記録の画像参照が不正です。');validateQualityReview(review,group,covered);review={version:1,groupId:review.groupId,recordedAt:review.recordedAt,decision:review.decision,imageId:review.imageId,reason:review.reason,issues:[...review.issues],displayWidths:review.displayWidths.map(({imageId,width})=>({imageId,width})),...(review.context?{context:validateReviewContext(review.context)}:{})};}
 if(group.projectName!==undefined&&(projectName(group.projectName)!==group.projectName||!Number.isFinite(Date.parse(group.projectUpdatedAt))))fail('案件名の記録が不正です。');
 revisionChecks(images);
 return comparisonBundle({groups:[{version:1,id:group.id,capturedAt:group.capturedAt,input:normalizedInput,sourceImageDataUrl:group.sourceImageDataUrl,...(group.additionalImageDataUrls?{additionalImageDataUrls:group.additionalImageDataUrls}:{}),...(group.projectName?{projectName:group.projectName,projectUpdatedAt:group.projectUpdatedAt}:{})}],images,reviews:review?[review]:[]},group.id);
}
export async function validateCompleteImport(value){
 const sets=value?.kind==='human_quality_review'?[value]:['complete-comparison-report-1.0.0','complete-comparison-report-1.1.0'].includes(value?.version)&&value.kind==='human_quality_report'&&value.assessment===null&&Array.isArray(value.sets)?value.sets:null;
 if(!sets||!sets.length||sets.length>MAX_IMAGES)fail('完成PNGの比較JSONが必要です（最大60組）。');
 const normalized=[],groupIds=new Set(),imageIds=new Set();let totalImages=0;
 for(const set of sets){
  const bundle=await validateCompleteBundle(set);
  if(groupIds.has(bundle.group.id))fail('同じファイルに比較組が重複しています。');
  groupIds.add(bundle.group.id);
  for(const image of bundle.images){if(imageIds.has(image.id))fail('同じファイルに完成画像IDが重複しています。');imageIds.add(image.id);}
  totalImages+=bundle.images.length;if(totalImages>MAX_IMAGES)fail('1回に読み込める完成PNGは60枚までです。');
  normalized.push(bundle);
 }
 return normalized;
}
export async function diagnosticRequest(bundle,imageIds){
 const checked=await validateCompleteBundle(bundle),images=imageIds?checked.images.filter(x=>imageIds.includes(x.id)):checked.images;
 if(!images.length||images.length>(checked.group.input?Math.max(1,3-(checked.group.additionalImageDataUrls?.length??0)):4)||imageIds&&(new Set(imageIds).size!==imageIds.length||imageIds.length!==images.length))fail('1回の診断は入力写真と完成PNGを合わせて4枚までです。入力写真が4枚の組は、完成PNG1枚と合わせて5枚までです。');
 const assets=new Map();
 async function asset(dataUrl,role,width,height){const data=bytes(dataUrl),hash=await sha(data),assetId=`${role}-${hash}`;if(!assets.has(assetId))assets.set(assetId,{assetId,role,sha256:hash,mimeType:'image/png',width,height,byteLength:data.length,dataUrl});return assetId;}
 const sourcePhotoAssetId=checked.group.input?await asset(checked.group.sourceImageDataUrl,'source_photo',1280,720):null,refs=[];
 const additionalSourcePhotoAssetIds=[];for(const url of checked.group.additionalImageDataUrls??[])additionalSourcePhotoAssetIds.push(await asset(url,'source_photo',1280,720));
 for(const image of images)refs.push({imageId:image.id,assetId:await asset(image.result.imageDataUrl,'complete_thumbnail',1536,864),role:'complete_thumbnail',generationVersion:image.result.generation_version,sourcePhotoAssetId,...(additionalSourcePhotoAssetIds.length?{additionalSourcePhotoAssetIds}:{}),backgroundAssetId:null,headlineProvided:checked.group.input?.headline??null,renderedTextVerified:false,textRegions:null});
 return {assetVersion:additionalSourcePhotoAssetIds.length===3?'image-assets-1.2.0':additionalSourcePhotoAssetIds.length?'image-assets-1.1.0':'image-assets-1.0.0',assets:[...assets.values()],images:refs};
}
export async function diagnoseComplete(bundle,imageId){
 const request=await diagnosticRequest(bundle,[imageId]),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch('/api/v1/complete-diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'PNG診断に失敗しました。');return result;}finally{clearTimeout(timer);}
}
export function diagnosticText(result,imageId){
 const image=result.images?.find(x=>x.imageId===imageId),asset=result.assets?.find(x=>x.assetId===image?.assetId);if(!asset)fail('PNG診断の結果に画像参照がありません。');
 if(asset.status!=='analyzed')return `PNG診断：未評価。${asset.reasons.join(' ')} 文字・人物の保持・品質の点数は未評価です。`;
 return `PNG診断：${asset.width}×${asset.height}を解析しました。${asset.luminance?`平均の明るさ ${asset.luminance.mean.toFixed(3)} / ほぼ単色の兆候 ${asset.nearlyUniform?'あり':'なし'}。`:'不透明な画素のサンプルがなく、明るさは未評価。'} 文字の正しさ・読みやすさ・人物の保持・品質の点数は未評価です。`;
}

const utf8=value=>new TextEncoder().encode(value);
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sharePreview(report){
 const picture=(hash,alt)=>`<img src="assets/${hash}.png" alt="${escapeHtml(alt)}" loading="lazy">`;
 const groups=report.sets.map((set,index)=>{
  const input=set.group.input,review=set.review,checks=revisionChecks(set.images);
  const selected=review?.decision==='none_acceptable'?'全部使わない':review?`案 ${set.images.findIndex(x=>x.id===review.imageId)+1}`:'未記録';
  return `<section><h2>${index+1}：${escapeHtml(input?.title??'入力条件不明の以前の完成画像')}</h2>
  <p>動画内容の補足：${escapeHtml(input?.brief||'補足なし')}<br>仕上がりのイメージ：${escapeHtml(input?.visualIntent??'未指定')}</p>
  ${input?`<details><summary>入力写真</summary>${picture(input.sourceSha256,'入力写真')}${(input.additionalSourceSha256s??[]).map((hash,i)=>picture(hash,'追加の写真'+(i+1))).join('')}</details>`:''}
  <div class="images">${set.images.map((image,i)=>`<article><h3>完成案 ${i+1}</h3>${picture(image.imageSha256,`完成案 ${i+1}`)}<p>${escapeHtml(image.result.generation_version??'生成版不明')}・未採点<br>確認済み実費：${escapeHtml(image.observation?.costUsd??'未確認')} USD<br>PNG保存：${escapeHtml(({saved:'確認できた',failed:'できなかった',unknown:'未確認'})[image.observation?.pngSave]??'未確認')}</p></article>`).join('')}</div>
  ${set.images.filter(image=>image.feedbackContext||image.result.feedbackApplied).map(image=>`<p>完成画像 ${escapeHtml(image.id)}：${escapeHtml(feedbackText(image.feedbackContext??image.result.feedbackApplied))}</p>`).join('')}
  ${set.images.filter(image=>image.result.referenceContext).map(image=>`<p>${escapeHtml(referenceContextText(image.result.referenceContext))}</p>`).join('')}
  ${set.images.filter(image=>image.subjectRegions).map(image=>`<p>完成画像 ${escapeHtml(image.id)}：${escapeHtml(subjectRegionsText(image.subjectRegions))}</p>`).join('')}
  ${checks.map(check=>`<p>修正画像 ${escapeHtml(check.imageId)}：${escapeHtml(check.reason)}<br>修正元ID：${escapeHtml(check.parentImageId)}<br>修正元SHA-256：${escapeHtml(check.parentImageSha256)}</p>`).join('')}
  <p>保存された選択：${escapeHtml(selected)}${review&&!set.reviewCoversAllImages?'（新しい案の再確認待ち）':''}<br>理由：${escapeHtml(review?.reason??'未記録')}<br>気になる点：${escapeHtml(review?.issues.join(' / ')??'未記録')}</p></section>`;
 }).join('');
 return `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; style-src 'unsafe-inline'"><title>完成PNGの共有記録</title><style>body{font:16px system-ui,sans-serif;margin:24px;background:#101525;color:#edf2ff}section{border-top:1px solid #506077;padding:16px 0}.images{display:flex;flex-wrap:wrap;gap:20px}img{width:min(100%,360px);height:auto}article{max-width:360px}p{white-space:pre-wrap;overflow-wrap:anywhere}summary{cursor:pointer}</style><h1>完成PNGの共有記録</h1><p>ZIPをすべて展開してから開いてください。保存された画像と人の記録を表示します。閲覧は新しい比較記録になりません。完成PNGは未採点です。外部通信・API課金はありません。</p>${groups}</html>`;
}
function restoreScript(){return `import {readFile,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await readFile(join(root,'transfer-manifest.json'),'utf8'));
if(manifest.version!=='private-comparison-transfer-1.0.0'||manifest.compactReport.filename!=='report-with-asset-references.json'||!Array.isArray(manifest.assets))throw new Error('Unsupported transfer manifest');
const compact=await readFile(join(root,'report-with-asset-references.json'));
if(compact.length!==manifest.compactReport.bytes||hash(compact)!==manifest.compactReport.sha256)throw new Error('Compact report checksum mismatch');
let restored=compact.toString('utf8');
for(const asset of manifest.assets){
 if(!/^[a-f0-9]{64}$/.test(asset.sha256)||asset.path!=='assets/'+asset.sha256+'.png'||asset.token!=='private-png-sha256:'+asset.sha256)throw new Error('Invalid asset path');
 const bytes=await readFile(join(root,asset.path));
 if(bytes.length!==asset.bytes||hash(bytes)!==asset.sha256)throw new Error('PNG checksum mismatch');
 if(restored.split(asset.token).length-1!==asset.occurrences)throw new Error('Asset reference count mismatch');
 restored=restored.split(asset.token).join('data:image/png;base64,'+bytes.toString('base64'));
}
const bytes=Buffer.from(restored,'utf8');
if(bytes.length!==manifest.sourceReport.bytes||hash(bytes)!==manifest.sourceReport.sha256)throw new Error('Restored report checksum mismatch');
JSON.parse(restored);
const destination=join(root,'complete-comparison-report.restored.json');
try{await writeFile(destination,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST'||hash(await readFile(destination))!==manifest.sourceReport.sha256)throw error;}
console.log('元の比較JSONを復元しました。SHA-256とバイト数は一致しています。');
console.log(destination);
`;}
export async function createCompleteShareZip(value){
 const original=JSON.stringify(value,null,2),originalBytes=utf8(original);
 if(originalBytes.length>MAX_IMPORT_BYTES)fail('共有する比較記録は70MiB以下にしてください。');
 // Freeze this export before awaiting, and verify hashes/references rather than trusting summaries.
 const report=JSON.parse(original);await validateCompleteImport(report);
 if(report.kind!=='human_quality_report')fail('共有ZIPには全組の比較reportが必要です。');
 const assets=new Map(),urls=new Map(),entries=[];
 for(const set of report.sets){
  const references=[...(set.group.input?[{url:set.group.sourceImageDataUrl,hash:set.group.input.sourceSha256},...(set.group.additionalImageDataUrls??[]).map((url,i)=>({url,hash:set.group.input.additionalSourceSha256s[i]}))]:[]),...set.images.map(image=>({url:image.result.imageDataUrl,hash:image.imageSha256}))];
  for(const {url,hash}of references){
   if(urls.has(url))continue;
   const binary=atob(url.slice(22));if(btoa(binary)!==url.slice(22))fail('PNGのBase64表記を確認できません。通常の比較JSONで保存してください。');
   if(!assets.has(hash)){const data=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)data[i]=binary.charCodeAt(i);assets.set(hash,{sha256:hash,path:`assets/${hash}.png`,bytes:data.length,token:`private-png-sha256:${hash}`,occurrences:0});entries.push({name:`assets/${hash}.png`,data});}
   urls.set(url,assets.get(hash));await tick();
  }
 }
 let compact=original;
 for(const [url,asset]of urls){if(original.includes(asset.token))fail('画像参照と記録の文字が重複しました。通常の比較JSONで保存してください。');asset.occurrences+=compact.split(url).length-1;compact=compact.split(url).join(asset.token);}
 const compactBytes=utf8(compact),manifest={version:'private-comparison-transfer-1.0.0',createdAt:new Date().toISOString(),sourceReport:{filename:'complete-comparison-report.json',bytes:originalBytes.length,sha256:await sha(originalBytes)},compactReport:{filename:'report-with-asset-references.json',bytes:compactBytes.length,sha256:await sha(compactBytes)},assets:[...assets.values()]};
 const textFiles={
  'report-with-asset-references.json':compact,
  'transfer-manifest.json':JSON.stringify(manifest,null,2),
  'summary.json':JSON.stringify(report.summary,null,2),
  'human-reviews.jsonl':report.sets.filter(x=>x.review).map(x=>JSON.stringify(x.review)).join('\n')+'\n',
  'preview.html':sharePreview(report),
  'restore-report.mjs':restoreScript(),
  'README.txt':'完成PNGの共有ZIP\n\nZIPをすべて展開してpreview.htmlを開くと、入力写真・完成PNG・保存された人の記録を確認できます。画像の画質と記録は変更していません。同じPNGはassets/へ1枚ずつ保存しました。\n\n元の比較JSONが必要な場合、展開したフォルダーで「node restore-report.mjs」を実行してください。Node標準機能だけを使い、元のJSONのSHA-256とバイト数の一致も検証します。complete-comparison-report.restored.jsonをWebへ読み込むか、既存のscripts/analyze-complete-comparisons.mjsへ渡してください。report-with-asset-references.jsonは転送専用で、直接取り込みできません。\n\nsummary.jsonは現在保存中の成功画像の集計、human-reviews.jsonlは保存された人の記録です。1枚の確認・再確認待ち・未確認の利用確認を20件完了として扱いません。完成PNGの品質点数と採点との順位一致は未実装です。このZIP作成ではPNG診断を追加実行していません。\n\nこのZIPはブラウザ内で作成し、写真を送信・生成しません。共有は本人が行ってください。写真と記録を含むため非公開で渡し、Gitに入れないでください。\n'
 };
 for(const [name,text]of Object.entries(textFiles))entries.push({name,data:utf8(text)});
 const blob=await writeZip(entries);
 return {blob,originalBytes:originalBytes.length,zipBytes:blob.size,assets:assets.size,groups:report.sets.length,images:report.sets.reduce((sum,set)=>sum+set.images.length,0)};
}
