export const COMPOSITIONS={auto:'写真に合わせて自動',text_left:'文字を左・主役を右',text_right:'文字を右・主役を左',text_top:'見出しを上・主役を大きく'};
export const MAX_IMAGES=6, MAX_STORED_CHARS=64*1024*1024;
const fail=message=>{throw new Error(message);};
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const shaPattern=/^[a-f0-9]{64}$/;
const text=(value,max)=>typeof value==='string'&&!!value.trim()&&[...value].length<=max;
function png(value,max){
 if(typeof value!=='string'||value.length>max||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))fail('比較画像はPNGで保存してください。');
 const encoded=value.split(',')[1];if(encoded.length%4)fail('PNGの形式が不正です。');
 const header=Uint8Array.from(atob(encoded.slice(0,32)),c=>c.charCodeAt(0));
 if(header.length<24||[137,80,78,71,13,10,26,10].some((v,i)=>header[i]!==v)||String.fromCharCode(...header.slice(12,16))!=='IHDR')fail('PNGの形式が不正です。');
 const view=new DataView(header.buffer);return {width:view.getUint32(16),height:view.getUint32(20)};
}
async function hashBytes(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const hashPng=value=>hashBytes(Uint8Array.from(atob(value.split(',')[1]),c=>c.charCodeAt(0)));
function result(value){
 const size=png(value?.imageDataUrl,24*1024*1024);if(size.width!==1536||size.height!==864)fail('完成PNGは1536×864の画像が必要です。');
 return {apiVersion:'1',mode:'ai_complete',...size,imageDataUrl:value.imageDataUrl,generation_version:typeof value.generation_version==='string'?value.generation_version:null,limitations:Array.isArray(value.limitations)?value.limitations.filter(x=>typeof x==='string').map(x=>x.slice(0,2000)).slice(0,20):['入力条件が不明な以前の完成画像です。未採点です。']};
}
export async function createEntry(payload,value,{id=crypto.randomUUID(),capturedAt=new Date().toISOString(),elapsedMs=null}={}){
 for(const [key,max]of [['title',120],['brief',1000],['headline',80]])if(!text(payload?.[key],max))fail('比較するタイトル・内容・見出しを確認してください。');
 const size=png(payload.imageDataUrl,3*1024*1024);if(size.width!==1280||size.height!==720)fail('入力写真は1280×720が必要です。');
 const composition=payload.composition??'auto';if(!Object.hasOwn(COMPOSITIONS,composition))fail('構図の希望が不正です。');
 const sourceSha256=await hashPng(payload.imageDataUrl),input={title:payload.title,brief:payload.brief,headline:payload.headline,sourceSha256};
 const groupId=`complete-${await hashBytes(new TextEncoder().encode(JSON.stringify(input)))}`,image=result(value);
 const entry={group:{version:1,id:groupId,capturedAt,input,sourceImageDataUrl:payload.imageDataUrl},image:{version:1,id,groupId,capturedAt,composition,elapsedMs,result:image,imageSha256:await hashPng(image.imageDataUrl)}};
 validateEntry(entry);return entry;
}
export async function createLegacyEntry(value,{id=crypto.randomUUID(),capturedAt=new Date().toISOString()}={}){
 const image=result(value),imageSha256=await hashPng(image.imageDataUrl),groupId=`legacy-${imageSha256}`;
 const entry={group:{version:1,id:groupId,capturedAt,input:null,sourceImageDataUrl:null},image:{version:1,id,groupId,capturedAt,composition:null,elapsedMs:null,result:image,imageSha256}};
 validateEntry(entry);return entry;
}
export function validateEntry({group,image}={}){
 if(!group||group.version!==1||!date(group.capturedAt)||!/^((complete|legacy)-[a-f0-9]{64})$/.test(group.id)||!image||image.version!==1||image.groupId!==group.id||!text(image.id,200)||!date(image.capturedAt)||!shaPattern.test(image.imageSha256))fail('完成画像の比較記録が不正です。');
 if(group.input===null){if(!group.id.startsWith('legacy-')||group.sourceImageDataUrl!==null||image.composition!==null)fail('以前の画像に入力条件を推測で付けられません。');}
 else {if(!group.id.startsWith('complete-')||!shaPattern.test(group.input.sourceSha256)||!Object.hasOwn(COMPOSITIONS,image.composition))fail('入力写真・構図の記録が不正です。');for(const [key,max]of [['title',120],['brief',1000],['headline',80]])if(!text(group.input[key],max))fail('入力内容が不正です。');const size=png(group.sourceImageDataUrl,3*1024*1024);if(size.width!==1280||size.height!==720)fail('入力写真の寸法が不正です。');}
 result(image.result);if(!(image.elapsedMs===null||Number.isInteger(image.elapsedMs)&&image.elapsedMs>=0))fail('生成時間が不正です。');return {group,image};
}
export function addToGallery(state,entry){
 validateEntry(entry);
 // The same completed PNG is archived once, including migration of a restored draft.
 if(state.images.some(x=>x.imageSha256===entry.image.imageSha256&& (entry.group.input===null||x.groupId===entry.group.id)))return {...state,added:false};
 const existing=state.groups.find(g=>g.id===entry.group.id);
 if(existing&&(JSON.stringify(existing.input)!==JSON.stringify(entry.group.input)||existing.sourceImageDataUrl!==entry.group.sourceImageDataUrl))fail('同じ組IDの入力条件は変更できません。');
 if(state.images.some(x=>x.id===entry.image.id))fail('完成画像IDが重複しています。');
 const next={groups:existing?state.groups:[...state.groups,entry.group],images:[...state.images,entry.image],reviews:state.reviews};
 if(next.images.length>MAX_IMAGES||next.groups.reduce((n,g)=>n+(g.sourceImageDataUrl?.length??0),0)+next.images.reduce((n,x)=>n+x.result.imageDataUrl.length,0)>MAX_STORED_CHARS)fail('完成画像の比較保存がいっぱいです。必要なPNG・比較JSONを保存してから、不要な組を削除してください。');
 return {...next,added:true};
}
export function validateQualityReview(review,group,images){
 const ids=images.filter(x=>x.groupId===group.id).map(x=>x.id);
 if(review?.version!==1||review.groupId!==group.id||!date(review.recordedAt)||!['selected','none_acceptable'].includes(review.decision)||(review.decision==='selected'?!ids.includes(review.imageId):review.imageId!==null))fail('使いたい案、または「全部使わない」を選んでください。');
 if(typeof review.reason!=='string'||review.reason.length>1000||!Array.isArray(review.issues)||new Set(review.issues).size!==review.issues.length||review.issues.some(x=>!['text','subject','composition','other'].includes(x)))fail('理由・気になる点の記録が不正です。');
 if(!Array.isArray(review.displayWidths)||review.displayWidths.length!==ids.length||new Set(review.displayWidths.map(x=>x.imageId)).size!==ids.length||review.displayWidths.some(x=>!ids.includes(x.imageId)||!Number.isFinite(x.width)||x.width<=0))fail('比較した実際の表示幅を確認してください。');
 if(review.context!==undefined)validateReviewContext(review.context);
 return review;
}
export function validateReviewContext(value){
 if(value?.version!==1||typeof value.reviewerId!=='string'||!/^r[0-9a-z_-]{1,39}$/i.test(value.reviewerId)||!['unknown','original','external','synthetic'].includes(value.titleSource)||typeof value.titlePermissionConfirmed!=='boolean'||typeof value.photoPermissionConfirmed!=='boolean')fail('評価者はr01のような匿名IDを指定し、タイトルの出典と利用確認を確かめてください。');
 return {version:1,reviewerId:value.reviewerId,titleSource:value.titleSource,titlePermissionConfirmed:value.titlePermissionConfirmed,photoPermissionConfirmed:value.photoPermissionConfirmed};
}
export function comparisonBundle(state,groupId){
 const group=state.groups.find(x=>x.id===groupId);if(!group)fail('比較する組がありません。');
 const images=state.images.filter(x=>x.groupId===groupId),review=state.reviews.find(x=>x.groupId===groupId)??null;
 return {version:'complete-comparison-1.2.0',kind:'human_quality_review',assessment:null,group,images,review,reviewCoversAllImages:!!review&&images.length===review.displayWidths.length&&images.every(x=>review.displayWidths.some(w=>w.imageId===x.id)),note:'完成PNGは未採点です。人の選択は自動学習やCTR予測ではありません。写真・完成画像を含む非公開の比較記録です。'};
}
export function parseCostUsd(value){
 if(typeof value!=='string')fail('実費はUSDの金額で入力してください。');
 const input=value.trim();if(!input)return null;
 if(!/^\d+(\.\d{1,6})?$/.test(input)||Number(input)>1000)fail('実費は0〜1000 USD、小数6桁までの金額で入力してください。未確認なら空欄にしてください。');
 return Number(input);
}
export function validateObservation(value){
 const cost=value?.costUsd;
 if(value?.version!==1||!date(value.recordedAt)||!(cost===null||Number.isFinite(cost)&&cost>=0&&cost<=1000&&Math.abs(cost*1e6-Math.round(cost*1e6))<1e-6)||!['unknown','saved','failed'].includes(value.pngSave))fail('実費・PNG保存結果の記録が不正です。');
 return {version:1,recordedAt:value.recordedAt,costUsd:cost,pngSave:value.pngSave};
}
export function recordObservation(state,imageId,value){
 const observation=validateObservation(value);if(!state.images.some(x=>x.id===imageId))fail('記録する完成画像がありません。');
 return {...state,images:state.images.map(x=>x.id===imageId?{...x,observation}:x)};
}
export function gallerySummary(state){
 const bundles=state.groups.map(g=>comparisonBundle(state,g.id)),current=bundles.filter(x=>x.reviewCoversAllImages),times=state.images.map(x=>x.elapsedMs).filter(x=>Number.isInteger(x)&&x>=0).sort((a,b)=>a-b);
 const observations=state.images.map(x=>x.observation===undefined?null:validateObservation(x.observation)),costs=observations.map(x=>x?.costUsd).filter(x=>x!==null&&x!==undefined);
 const comparisons=current.filter(x=>x.group.input&&x.images.length>=2&&x.review.context),authorized=comparisons.filter(x=>['original','external'].includes(x.review.context.titleSource)&&x.review.context.titlePermissionConfirmed&&x.review.context.photoPermissionConfirmed);
 return {images:state.images.length,groups:state.groups.length,reviewedGroups:current.length,comparedGroups:current.filter(x=>x.images.length>=2).length,singleImageReviews:current.filter(x=>x.images.length===1).length,allRejectedGroups:current.filter(x=>x.review.decision==='none_acceptable').length,staleReviews:bundles.filter(x=>x.review&&!x.reviewCoversAllImages).length,collection:{target:20,humanComparisons:comparisons.length,authorizedRealComparisons:authorized.length,note:'現在保存中の組のみ。出典・利用確認は人の申告です。完成PNGは未採点で、採点との一致は算出しません。'},
  generationTime:{known:times.length,unknown:state.images.length-times.length,medianMs:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null,p95Ms:times.length?times[Math.ceil(times.length*.95)-1]:null},
  cost:{currency:'USD',confirmedImages:costs.length,unknownImages:state.images.length-costs.length,confirmedTotalUsd:costs.length?costs.reduce((sum,x)=>sum+Math.round(x*1e6),0)/1e6:null},
  pngSave:{saved:observations.filter(x=>x?.pngSave==='saved').length,failed:observations.filter(x=>x?.pngSave==='failed').length,unknown:observations.filter(x=>!x||x.pngSave==='unknown').length},
  note:'現在ブラウザ内に残っている生成成功画像のみの集計です。削除した画像・失敗したAPI試行は含まず、API成功率や累計費用は算出しません。1枚だけの品質確認と、2枚以上の比較を区別します。'};
}
export function comparisonReport(state,{exportedAt=new Date().toISOString()}={}){
 if(!date(exportedAt))fail('書き出し時刻が不正です。');
 return {version:'complete-comparison-report-1.0.0',kind:'human_quality_report',exportedAt,assessment:null,summary:gallerySummary(state),sets:state.groups.map(g=>comparisonBundle(state,g.id)),note:'写真・完成PNGを含む非公開データです。SVG比較CSVとは別形式で、許諾済み20タイトルや正式な採点検証件数には自動で加えません。'};
}
