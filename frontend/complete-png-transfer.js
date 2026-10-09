import {createEntry,createLegacyEntry,validateQualityReview,validateObservation,validateReviewContext} from './complete-gallery-model.js';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const bytes=url=>Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0));
const fail=message=>{throw new Error(message);};
const sameInput=(a,b)=>a===null?b===null:!!b&&Object.keys(b).length===4&&['title','brief','headline','sourceSha256'].every(k=>a[k]===b[k]);

// Verify frozen identities again; exported summaries and imported diagnostics are not trusted.
export async function validateCompleteBundle(value){
 if(!value||!['complete-comparison-1.0.0','complete-comparison-1.1.0','complete-comparison-1.2.0'].includes(value.version)||value.kind!=='human_quality_review'||value.assessment!==null||!value.group||!Array.isArray(value.images)||!value.images.length||value.images.length>6)fail('完成PNGの比較JSONの版・件数が不正です。');
 const group=value.group,images=[];
 for(const image of value.images){
  if(images.some(x=>x.id===image.id))fail('完成画像IDが重複しています。');
  const options={id:image.id,capturedAt:image.capturedAt,elapsedMs:image.elapsedMs};
  const entry=group.input===null?await createLegacyEntry(image.result,options):await createEntry({...group.input,imageDataUrl:group.sourceImageDataUrl,composition:image.composition},image.result,options);
  if(entry.group.id!==group.id||entry.group.sourceImageDataUrl!==group.sourceImageDataUrl||entry.image.groupId!==image.groupId||entry.image.imageSha256!==image.imageSha256||!sameInput(entry.group.input,group.input)||entry.image.composition!==image.composition||entry.image.elapsedMs!==image.elapsedMs||image.version!==1)fail('画像・入力条件・組ID・SHA-256が一致しません。');
  if(image.result.width!==entry.image.result.width||image.result.height!==entry.image.result.height)fail('宣言寸法とPNGの寸法が一致しません。');
  images.push({...entry.image,...(image.observation?{observation:validateObservation(image.observation)}:{})});
 }
 if(group.version!==1||typeof group.capturedAt!=='string'||!Number.isFinite(Date.parse(group.capturedAt)))fail('比較組の保存時刻が不正です。');
 let review=value.review??null;
 if(review){const covered=images.filter(x=>review.displayWidths?.some(w=>w.imageId===x.id));if(!covered.length)fail('比較記録の画像参照が不正です。');validateQualityReview(review,group,covered);review={version:1,groupId:review.groupId,recordedAt:review.recordedAt,decision:review.decision,imageId:review.imageId,reason:review.reason,issues:[...review.issues],displayWidths:review.displayWidths.map(({imageId,width})=>({imageId,width})),...(review.context?{context:validateReviewContext(review.context)}:{})};}
 return {version:'complete-comparison-1.2.0',kind:'human_quality_review',assessment:null,group:{version:1,id:group.id,capturedAt:group.capturedAt,input:group.input===null?null:{title:group.input.title,brief:group.input.brief,headline:group.input.headline,sourceSha256:group.input.sourceSha256},sourceImageDataUrl:group.sourceImageDataUrl},images,review,reviewCoversAllImages:!!review&&review.displayWidths.length===images.length};
}
export async function diagnosticRequest(bundle,imageIds){
 const checked=await validateCompleteBundle(bundle),images=imageIds?checked.images.filter(x=>imageIds.includes(x.id)):checked.images;
 if(!images.length||images.length>(checked.group.input?3:4)||imageIds&&(new Set(imageIds).size!==imageIds.length||imageIds.length!==images.length))fail('1回の診断は完成PNG3枚と入力写真1枚までです。');
 const assets=new Map();
 async function asset(dataUrl,role,width,height){const data=bytes(dataUrl),hash=await sha(data),assetId=`${role}-${hash}`;if(!assets.has(assetId))assets.set(assetId,{assetId,role,sha256:hash,mimeType:'image/png',width,height,byteLength:data.length,dataUrl});return assetId;}
 const sourcePhotoAssetId=checked.group.input?await asset(checked.group.sourceImageDataUrl,'source_photo',1280,720):null,refs=[];
 for(const image of images)refs.push({imageId:image.id,assetId:await asset(image.result.imageDataUrl,'complete_thumbnail',1536,864),role:'complete_thumbnail',generationVersion:image.result.generation_version,sourcePhotoAssetId,backgroundAssetId:null,headlineProvided:checked.group.input?.headline??null,renderedTextVerified:false,textRegions:null});
 return {assetVersion:'image-assets-1.0.0',assets:[...assets.values()],images:refs};
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
