import {createHash} from 'node:crypto';
import {isReviewerId} from '../../shared/reviewer-id.mjs';
import {normalizeReferenceContext} from '../../shared/thumbnail-references.mjs';
import {feedbackExposure,feedbackUsage,feedbackOf,groupSplit,SPLIT_VERSION} from './feedback-audit.mjs';
export const LEGACY_TRIAL_GENERATION_VERSION='ai-complete-0.6.1';
function supportedVersion(version){
 const match=/^ai-complete-0\.(\d+)\.(\d+)$/.exec(version??'');
 return !!match&&(Number(match[1])>6||Number(match[1])===6&&Number(match[2])>=1)&&feedbackUsage({result:{generation_version:version}}).feedbackUsageKnown;
}
function referenceIdentity(image){
 const mode=image.referenceMode??'off',context=image.result.referenceContext;
 if(mode==='off')return context===undefined?'off':null;
 if(mode!=='auto'||context===undefined)return null;
 try{return 'auto:'+JSON.stringify(normalizeReferenceContext(context));}catch{return null;}
}
const compatible=(a,b)=>a.result.generation_version===b.result.generation_version&&(a.design??'auto')===(b.design??'auto')&&(a.composition??'auto')===(b.composition??'auto')&&referenceIdentity(a)===referenceIdentity(b);
// Freeze one earliest compatible pair per holdout group; do not select the pair by its human rating.
export function prepareFeedbackTrials(dataset,reviewerId,{generationVersion=LEGACY_TRIAL_GENERATION_VERSION}={}){
 if(!isReviewerId(reviewerId))throw new Error('評価者IDはr01のような数字のIDを指定してください。');
 if(!supportedVersion(generationVersion))throw new Error('比較する生成版は、メモ利用を確認できる0.6.1以降の既知の版を指定してください。');
 const exposure=feedbackExposure(dataset.images),contaminated=new Set(exposure.contaminatedGroupIds),pairs=[],excluded=[];
 for(const group of dataset.groups){
  const skip=reason=>excluded.push({groupId:group.id,reason});
  if(groupSplit(group.id)!=='holdout'){skip('not_holdout');continue;}
  if(contaminated.has(group.id)){skip('holdout_previously_used_as_feedback');continue;}
  if(!group.input||!group.sourcePhotoAssetId){skip('unknown_input');continue;}
  if(group.input.additionalSourceSha256s?.length){skip('multi_photo_review_not_supported');continue;}
  const source=dataset.assets.find(a=>a.assetId===group.sourcePhotoAssetId);
  if(source?.diagnostic?.status!=='analyzed'||source.sha256!==group.input.sourceSha256){skip('source_png_unavailable');continue;}
  const images=dataset.images.filter(x=>x.groupId===group.id&&!x.revision&&!x.result.revision&&x.result.generation_version===generationVersion&&feedbackUsage(x).feedbackUsageKnown).sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt)||a.id.localeCompare(b.id));
  const usable=images.filter(x=>referenceIdentity(x)!==null&&dataset.assets.some(a=>a.assetId===x.assetId&&a.diagnostic?.status==='analyzed')&&!(feedbackOf(x)?.records??[]).some(r=>groupSplit(r.groupId)!=='dev'));
  const controls=usable.filter(x=>!feedbackUsage(x).feedbackUsed),treated=usable.filter(x=>feedbackUsage(x).feedbackUsed);let pair;
  for(const a of controls){const b=treated.find(x=>compatible(a,x));if(b){pair=[a,b];break;}}
  if(!pair){skip('need_same_input_and_version_feedback_on_off');continue;}
  if(createHash('sha256').update(`${reviewerId}|${group.id}|feedback-blind-1`).digest()[0]<128)pair.reverse();
  pairs.push({trialId:`b${String(pairs.length+1).padStart(3,'0')}`,groupId:group.id,sourcePhotoAssetId:group.sourcePhotoAssetId,images:pair.map((x,i)=>({label:i?'B':'A',imageId:x.id,imageSha256:x.imageSha256,feedbackUsed:feedbackUsage(x).feedbackUsed}))});
 }
 return {version:generationVersion===LEGACY_TRIAL_GENERATION_VERSION?'feedback-blind-trials-1.0.0':'feedback-blind-trials-1.1.0',generationVersion,reviewerId,splitVersion:SPLIT_VERSION,pairs,excluded,note:'条件を記した対応表は評価者に見せません。同じ生成版・入力・デザイン・構図・参考資料だけを比較します。評価や利用確認は空欄のまま、人が記録します。'};
}
export function trialItems(dataset,plan,reviewItems){const ids=new Set(plan.pairs.flatMap(x=>x.images.map(i=>i.imageId)));return reviewItems({...dataset,images:dataset.images.filter(x=>ids.has(x.id))},plan.reviewerId);}
export function publicTrialItems(plan,items){const trialOf=new Map(plan.pairs.flatMap(p=>p.images.map(x=>[x.imageId,p.trialId])));return items.map(item=>{if(!trialOf.has(item.imageId))throw new Error('試行の画像参照が一致しません。');return {...item,imageId:item.trialId,groupId:trialOf.get(item.imageId)};});}
export function trialCsv(plan,items){const byId=new Map(items.map(x=>[x.imageId,x.trialId]));return 'trial_id,item_a,item_b,reviewer_id,preferred,reason\n'+plan.pairs.map(p=>[p.trialId,...p.images.map(x=>byId.get(x.imageId)),plan.reviewerId,'',''].join(',')).join('\n')+'\n';}
