import {isReviewerId} from './reviewer-id.mjs';
export const FEEDBACK_VERSION='generation-feedback-1.0.0';
export const FEEDBACK_ISSUES=['text','subject','composition','other'];
export const MAX_FEEDBACK_RECORDS=6;
const fail=message=>{throw new Error(message);};
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(k=>allowed.includes(k));
const text=(value,max)=>typeof value==='string'&&[...value].length<=max&&!/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value);
export function normalizeGenerationFeedback(value){
 if(!keys(value,['version','scope','projectName','reviewerId','records','criteria'])||value.version!==FEEDBACK_VERSION||!['project','all'].includes(value.scope)||!isReviewerId(value.reviewerId)||!Array.isArray(value.records)||value.records.length<1||value.records.length>MAX_FEEDBACK_RECORDS||!(value.scope==='all'?value.projectName===null:text(value.projectName,120)&&!!value.projectName.trim()))fail('生成に使う評価メモの形式・件数・評価者を確認してください。');
 const seen=new Set(),records=value.records.map(record=>{
  if(!keys(record,['groupId','recordedAt','decision','selectedImageId','reason','reasonTruncated','issues','images'])||!/^complete-[a-f0-9]{64}$/.test(record.groupId??'')||seen.has(record.groupId)||typeof record.recordedAt!=='string'||record.recordedAt.length>40||!Number.isFinite(Date.parse(record.recordedAt))||!['selected','none_acceptable'].includes(record.decision)||!text(record.reason,500)||typeof record.reasonTruncated!=='boolean'||!Array.isArray(record.issues)||new Set(record.issues).size!==record.issues.length||record.issues.some(x=>!FEEDBACK_ISSUES.includes(x))||!record.reason.trim()&&!record.issues.length||!Array.isArray(record.images)||record.images.length<1||record.images.length>12)fail('評価メモの選択・理由・参照が不正です。');
  seen.add(record.groupId);const ids=new Set(),images=record.images.map(image=>{if(!keys(image,['imageId','imageSha256','generationVersion'])||!text(image.imageId,200)||!image.imageId.trim()||ids.has(image.imageId)||!/^[a-f0-9]{64}$/.test(image.imageSha256??'')||!(image.generationVersion===null||text(image.generationVersion,100)))fail('評価メモの画像参照が不正です。');ids.add(image.imageId);return {imageId:image.imageId,imageSha256:image.imageSha256,generationVersion:image.generationVersion};});
  if(record.decision==='selected'?!ids.has(record.selectedImageId):record.selectedImageId!==null)fail('採用した画像の参照が一致しません。');
  return {groupId:record.groupId,recordedAt:record.recordedAt,decision:record.decision,selectedImageId:record.selectedImageId,reason:record.reason,reasonTruncated:record.reasonTruncated,issues:[...record.issues],images};
 });
 const criteria=FEEDBACK_ISSUES.filter(issue=>records.some(record=>record.issues.includes(issue)));
 if(!Array.isArray(value.criteria)||JSON.stringify(value.criteria)!==JSON.stringify(criteria))fail('確認ポイントと評価メモの分類が一致しません。');
 const normalized={version:FEEDBACK_VERSION,scope:value.scope,projectName:value.scope==='all'?null:value.projectName.trim(),reviewerId:value.reviewerId,records,criteria};
 if(JSON.stringify(normalized).length>24000)fail('評価メモが大きすぎます。使う記録を減らしてください。');return normalized;
}
export function normalizeFeedbackSettings(value){
 if(value===undefined)return {enabled:true,scope:'project',reviewerId:'r01',excluded:[]};
 if(!keys(value,['enabled','scope','reviewerId','excluded'])||typeof value.enabled!=='boolean'||!['project','all'].includes(value.scope)||!isReviewerId(value.reviewerId)||!Array.isArray(value.excluded)||value.excluded.length>60||value.excluded.some(x=>!text(x,140))||new Set(value.excluded).size!==value.excluded.length)fail('過去の評価を使う設定が不正です。');
 return {enabled:value.enabled,scope:value.scope,reviewerId:value.reviewerId,excluded:[...value.excluded]};
}
