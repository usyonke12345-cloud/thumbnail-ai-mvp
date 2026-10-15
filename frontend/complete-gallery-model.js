import {normalizeVisualIntent,normalizeVideoBrief} from '../shared/complete-designs.mjs';
import {isCompletePngDataUrl,MAX_COMPLETE_PNG_DATA_URL_LENGTH,revisionParent} from '../shared/complete-images.mjs';
import {isReviewerId} from '../shared/reviewer-id.mjs';
import {validateSubjectRegions} from './subject-regions.js';
export const COMPOSITIONS={auto:'写真に合わせて自動',text_left:'文字を左・主役を右',text_right:'文字を右・主役を左',text_top:'見出しを上・主役を大きく'};
export const DESIGNS={auto:'写真と内容に合わせて自動',photo_focus:'写真を主役にする',editorial:'落ち着いた誌面風',impact:'文字を大きく見せる'};
export const MAX_IMAGES=60, MAX_GROUP_IMAGES=12, MAX_PROJECT_IMAGES=24, MAX_STORED_CHARS=192*1024*1024;
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
 if(!isCompletePngDataUrl(value?.imageDataUrl))fail('完成PNGは16MiB以下で保存してください。');
 const size=png(value.imageDataUrl,MAX_COMPLETE_PNG_DATA_URL_LENGTH);if(size.width!==1536||size.height!==864)fail('完成PNGは1536×864の画像が必要です。');
 return {apiVersion:'1',mode:'ai_complete',...size,imageDataUrl:value.imageDataUrl,generation_version:typeof value.generation_version==='string'?value.generation_version:null,...(value.revision!==undefined?{revision:revisionParent(value.revision)}:{}),limitations:Array.isArray(value.limitations)?value.limitations.filter(x=>typeof x==='string').map(x=>x.slice(0,2000)).slice(0,20):['入力条件が不明な以前の完成画像です。未採点です。']};
}
function headlineInput(payload){
 const mode=payload?.headlineMode??'manual';if(!['auto','manual'].includes(mode))fail('見出しの作り方が不正です。');
 if(mode==='auto'){if(payload.headline!==undefined&&payload.headline!==null&&payload.headline!=='')fail('自動見出しでは指定した文言を混ぜられません。');return {headline:null,headlineMode:'auto'};}
 if(!text(payload.headline,80))fail('手入力の見出しを確認してください。');return {headline:payload.headline};
}
async function comparisonInput(payload){
 if(!text(payload?.title,120))fail('比較する動画タイトルを確認してください。');
 const headline=headlineInput(payload),visualIntent=normalizeVisualIntent(payload.visualIntent),brief=normalizeVideoBrief(payload.brief);
 const size=png(payload.imageDataUrl,3*1024*1024);if(size.width!==1280||size.height!==720)fail('入力写真は1280×720が必要です。');
 const sourceSha256=await hashPng(payload.imageDataUrl),input={title:payload.title,brief,headline:headline.headline,sourceSha256,...(headline.headlineMode?{headlineMode:headline.headlineMode}:{}),...(visualIntent?{visualIntent}:{})};
 return {input,groupId:`complete-${await hashBytes(new TextEncoder().encode(JSON.stringify(input)))}`};
}
export function projectName(value){if(value===undefined||value==='')return undefined;if(typeof value!=='string'||[...value].length>80||/[\u0000-\u001f\u007f]/u.test(value))fail('案件名は80文字以内で指定してください。');return value.trim()||undefined;}
export const projectOf=group=>group.projectName??group.input?.title??'入力条件不明';
export function validateRevision(value){if(!value||typeof value.instruction!=='string'||!value.instruction.trim()||[...value.instruction].length>300||/[\u0000-\u001f\u007f]/u.test(value.instruction))fail('修正指示と元画像の参照が不正です。');return {instruction:value.instruction,...revisionParent(value)};}
// Derived from verified image identities in this scope, never copied from imported claims.
export function revisionChecks(images,scope='comparison_bundle'){
 return images.filter(image=>image.revision||image.result?.revision).map(image=>{
  const reference=revisionParent(image.revision??image.result.revision),parent=images.find(x=>x.id===reference.parentImageId);
  if(reference.parentImageId===image.id||parent&&parent.imageSha256!==reference.parentImageSha256)fail('修正元の画像参照が一致しません。');
  return {imageId:image.id,...reference,scope,status:parent?'verified':'unverified',reason:parent?'修正元のIDとSHA-256を確認しました。':'修正元は未確認（照合範囲に元画像が含まれていません）。'};
 });
}
export async function checkGenerationCapacity(state,payload,name){const {input,groupId}=await comparisonInput(payload),existing=state.groups.find(g=>g.id===groupId),project=projectName(name)??(existing?projectOf(existing):input.title);if(state.images.length>=MAX_IMAGES)fail('比較履歴が60枚に達しています。必要な記録を保存してから不要な案件を削除してください。');if(state.images.filter(x=>x.groupId===groupId).length>=MAX_GROUP_IMAGES)fail('この組は12枚に達しています。生成前に整理してください。');const ids=new Set(state.groups.filter(g=>g.id===groupId||projectOf(g)===project).map(g=>g.id));if(state.images.filter(x=>ids.has(x.groupId)).length>=MAX_PROJECT_IMAGES)fail('この案件は24枚に達しています。生成前に整理してください。');}
export async function createEntry(payload,value,{id=crypto.randomUUID(),capturedAt=new Date().toISOString(),elapsedMs=null,projectName:name,revision}={}){
 const {input,groupId}=await comparisonInput(payload);
 const composition=payload.composition??'auto';if(!Object.hasOwn(COMPOSITIONS,composition))fail('構図の希望が不正です。');
 if(payload.design!==undefined&&!Object.hasOwn(DESIGNS,payload.design))fail('デザインの希望が不正です。');
 const image=result(value);
 const entry={group:{version:1,id:groupId,capturedAt,input,sourceImageDataUrl:payload.imageDataUrl},image:{version:1,id,groupId,capturedAt,composition,...(payload.design!==undefined?{design:payload.design}:{}),elapsedMs,result:image,imageSha256:await hashPng(image.imageDataUrl)}};
 const nameValue=projectName(name);if(nameValue){entry.group.projectName=nameValue;entry.group.projectUpdatedAt=capturedAt;}
 if(payload.revision)entry.image.revision=validateRevision({instruction:payload.revision.instruction,parentImageId:payload.revision.parentImageId,parentImageSha256:await hashPng(payload.revision.imageDataUrl)});
 else if(revision)entry.image.revision=validateRevision(revision);
 validateEntry(entry);return entry;
}
export async function createLegacyEntry(value,{id=crypto.randomUUID(),capturedAt=new Date().toISOString()}={}){
 const image=result(value),imageSha256=await hashPng(image.imageDataUrl),groupId=`legacy-${imageSha256}`;
 const entry={group:{version:1,id:groupId,capturedAt,input:null,sourceImageDataUrl:null},image:{version:1,id,groupId,capturedAt,composition:null,elapsedMs:null,result:image,imageSha256}};
 validateEntry(entry);return entry;
}
export function validateEntry({group,image}={}){
 if(!group||group.version!==1||!date(group.capturedAt)||!/^((complete|legacy)-[a-f0-9]{64})$/.test(group.id)||!image||image.version!==1||image.groupId!==group.id||!text(image.id,200)||!date(image.capturedAt)||!shaPattern.test(image.imageSha256))fail('完成画像の比較記録が不正です。');
 if(group.projectName!==undefined&&(projectName(group.projectName)!==group.projectName||!date(group.projectUpdatedAt)))fail('案件名の記録が不正です。');if(image.revision)validateRevision(image.revision);if(image.subjectRegions!==undefined)validateSubjectRegions(image.subjectRegions,group,image);
 if(image.revision&&image.result?.revision&&(image.revision.parentImageId!==image.result.revision.parentImageId||image.revision.parentImageSha256!==image.result.revision.parentImageSha256))fail('生成応答と保存記録の修正元が一致しません。');
 if(group.input===null){if(!group.id.startsWith('legacy-')||group.sourceImageDataUrl!==null||image.composition!==null)fail('以前の画像に入力条件を推測で付けられません。');}
 else {if(!group.id.startsWith('complete-')||!shaPattern.test(group.input.sourceSha256)||!Object.hasOwn(COMPOSITIONS,image.composition))fail('入力写真・構図の記録が不正です。');if(!text(group.input.title,120)||typeof group.input.brief!=='string'||normalizeVideoBrief(group.input.brief)!==group.input.brief)fail('入力内容が不正です。');headlineInput(group.input);normalizeVisualIntent(group.input.visualIntent);if(image.design!==undefined&&!Object.hasOwn(DESIGNS,image.design))fail('デザインの希望が不正です。');const size=png(group.sourceImageDataUrl,3*1024*1024);if(size.width!==1280||size.height!==720)fail('入力写真の寸法が不正です。');}
 result(image.result);if(!(image.elapsedMs===null||Number.isInteger(image.elapsedMs)&&image.elapsedMs>=0))fail('生成時間が不正です。');return {group,image};
}
export function galleryCapacity(state){const assets=new Map();for(const group of state.groups)if(group.input)assets.set(group.input.sourceSha256,typeof group.sourceImageDataUrl==='string'?group.sourceImageDataUrl.length:null);for(const image of state.images)assets.set(image.imageSha256,typeof image.result.imageDataUrl==='string'?image.result.imageDataUrl.length:null);return {uniqueAssets:assets.size,characters:[...assets.values()].some(x=>x===null)?null:[...assets.values()].reduce((a,b)=>a+b,0),limit:MAX_STORED_CHARS};}
export function checkGalleryCapacity(state){
 if(state.images.length>MAX_IMAGES||galleryCapacity(state).characters>MAX_STORED_CHARS)fail('完成画像の比較保存がいっぱいです。必要なPNG・比較JSONを保存してから、不要な案件を削除してください。');
 const projects=new Map();for(const group of state.groups){const count=state.images.filter(x=>x.groupId===group.id).length;if(count>MAX_GROUP_IMAGES)fail('1組の比較保存がいっぱいです（12枚まで）。');const name=projectOf(group);projects.set(name,(projects.get(name)??0)+count);}if([...projects.values()].some(n=>n>MAX_PROJECT_IMAGES))fail('1案件の比較保存がいっぱいです（24枚まで）。');
}
export function addToGallery(state,entry){
 validateEntry(entry);
 const existing=state.groups.find(g=>g.id===entry.group.id);
 if(existing&&(JSON.stringify(existing.input)!==JSON.stringify(entry.group.input)||existing.sourceImageDataUrl!==entry.group.sourceImageDataUrl))fail('同じ組IDの入力条件は変更できません。');
 const groups=existing&&entry.group.projectName?state.groups.map(g=>g.id===entry.group.id?{...g,projectName:entry.group.projectName,projectUpdatedAt:entry.group.projectUpdatedAt}:g):state.groups;
 // A duplicate PNG keeps its identity; an explicitly supplied project label still applies.
 if(state.images.some(x=>x.imageSha256===entry.image.imageSha256&& (entry.group.input===null||x.groupId===entry.group.id))){const next={...state,groups,added:false};checkGalleryCapacity(next);return next;}
 if(state.images.some(x=>x.id===entry.image.id))fail('完成画像IDが重複しています。');
 const next={groups:existing?groups:[...state.groups,entry.group],images:[...state.images,entry.image],reviews:state.reviews};
 checkGalleryCapacity(next);
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
 if(value?.version!==1||typeof value.reviewerId!=='string'||!isReviewerId(value.reviewerId)||!['unknown','original','external','synthetic'].includes(value.titleSource)||typeof value.titlePermissionConfirmed!=='boolean'||typeof value.photoPermissionConfirmed!=='boolean')fail('評価者はr01のような匿名IDを指定し、タイトルの出典と利用確認を確かめてください。');
 return {version:1,reviewerId:value.reviewerId,titleSource:value.titleSource,titlePermissionConfirmed:value.titlePermissionConfirmed,photoPermissionConfirmed:value.photoPermissionConfirmed};
}
export function comparisonBundle(state,groupId){
 const group=state.groups.find(x=>x.id===groupId);if(!group)fail('比較する組がありません。');
 const images=state.images.filter(x=>x.groupId===groupId),review=state.reviews.find(x=>x.groupId===groupId)??null;
 const checks=revisionChecks(images);
 return {version:images.some(x=>x.subjectRegions)?'complete-comparison-1.7.0':group.projectName||checks.length||images.length>6?'complete-comparison-1.6.0':group.input?.brief===''?'complete-comparison-1.5.0':group.input?.visualIntent?'complete-comparison-1.4.0':group.input?.headlineMode==='auto'||images.some(x=>x.design!==undefined)?'complete-comparison-1.3.0':'complete-comparison-1.2.0',kind:'human_quality_review',assessment:null,group,images,review,...(checks.length?{revisionChecks:checks}:{}),reviewCoversAllImages:!!review&&images.length===review.displayWidths.length&&images.every(x=>review.displayWidths.some(w=>w.imageId===x.id)),note:'完成PNGは未採点です。人の選択は自動学習やCTR予測ではありません。写真・完成画像を含む非公開の比較記録です。'};
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
  storage:galleryCapacity(state),note:'現在ブラウザ内に残っている生成成功画像のみの集計です。削除した画像・失敗したAPI試行は含まず、API成功率や累計費用は算出しません。1枚だけの品質確認と、2枚以上の比較を区別します。'};
}
export function comparisonReport(state,{exportedAt=new Date().toISOString()}={}){
 if(!date(exportedAt))fail('書き出し時刻が不正です。');
 const sets=state.groups.map(g=>comparisonBundle(state,g.id));return {version:state.images.length>6||state.groups.length>6||sets.some(x=>['complete-comparison-1.6.0','complete-comparison-1.7.0'].includes(x.version))?'complete-comparison-report-1.1.0':'complete-comparison-report-1.0.0',kind:'human_quality_report',exportedAt,assessment:null,summary:gallerySummary(state),sets,note:'写真・完成PNGを含む非公開データです。SVG比較CSVとは別形式で、許諾済み20タイトルや正式な採点検証件数には自動で加えません。'};
}

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const identical=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function latestRecord(previous,incoming,label){
 if(!previous)return incoming;if(!incoming)return previous;
 const oldTime=Date.parse(previous.recordedAt),newTime=Date.parse(incoming.recordedAt);
 if(oldTime===newTime&&!identical(previous,incoming))fail(`${label}の同時刻の記録が食い違っています。保存済みの記録は変更しません。`);
 return newTime>oldTime?incoming:previous;
}
// Receives bundles whose hashes/inputs were checked by validateCompleteImport.
// Computes the entire next state before an IndexedDB transaction writes anything.
export function mergeCompleteImport(state,bundles){
 const next={groups:[...state.groups],images:[...state.images],reviews:[...state.reviews]};
 for(const bundle of bundles){
  const group=bundle.group,existingGroup=next.groups.find(x=>x.id===group.id);
  if(existingGroup&&(!identical(existingGroup.input,group.input)||existingGroup.sourceImageDataUrl!==group.sourceImageDataUrl))fail('同じ組IDの入力条件は変更できません。');
  if(!existingGroup)next.groups.push(group);
  else if(group.projectName){if(!existingGroup.projectName||Date.parse(group.projectUpdatedAt)>Date.parse(existingGroup.projectUpdatedAt??existingGroup.capturedAt))next.groups[next.groups.indexOf(existingGroup)]={...existingGroup,projectName:group.projectName,projectUpdatedAt:group.projectUpdatedAt};else if(group.projectUpdatedAt===existingGroup.projectUpdatedAt&&group.projectName!==existingGroup.projectName)fail('案件名の同時刻の記録が食い違っています。');}
  for(const image of bundle.images){
   validateEntry({group,image});
   const existing=next.images.find(x=>x.id===image.id);
   if(existing){
    const {observation:oldObservation,subjectRegions:oldRegions,...oldFrozen}=existing,{observation:incomingObservation,subjectRegions:incomingRegions,...incomingFrozen}=image;
    if(!identical(oldFrozen,incomingFrozen))fail('同じ完成画像IDの内容が食い違っています。保存済みの画像は変更しません。');
    const observation=latestRecord(oldObservation,incomingObservation,'実費・保存結果'),subjectRegions=latestRecord(oldRegions,incomingRegions,'人物範囲');
    next.images[next.images.indexOf(existing)]={...oldFrozen,...(observation?{observation:validateObservation(observation)}:{}),...(subjectRegions?{subjectRegions:validateSubjectRegions(subjectRegions,group,image)}:{})};
   }else{
    if(next.images.some(x=>x.groupId===image.groupId&&x.imageSha256===image.imageSha256))fail('同じPNGが別の画像IDで記録されています。重複して読み込めません。');
    next.images.push({...image,...(image.observation?{observation:validateObservation(image.observation)}:{})});
   }
  }
  if(bundle.review){
   const covered=next.images.filter(x=>x.groupId===group.id&&bundle.review.displayWidths.some(w=>w.imageId===x.id));
   validateQualityReview(bundle.review,group,covered);
   const previous=next.reviews.find(x=>x.groupId===group.id),review=latestRecord(previous,bundle.review,'人の比較');
   next.reviews=next.reviews.filter(x=>x.groupId!==group.id);next.reviews.push(review);
  }
 }
 checkGalleryCapacity(next);
 return next;
}
