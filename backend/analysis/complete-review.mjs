import {validateCompleteBundle,diagnosticRequest} from '../../frontend/complete-png-transfer.js';
import {gallerySummary} from '../../frontend/complete-gallery-model.js';
import {analyzePngAssets,ANALYSIS_VERSION} from './complete-png.mjs';

const fail=message=>{throw new Error(message);};
function latest(a,b,label){
 if(!a)return b;if(!b)return a;
 const left=Date.parse(a.recordedAt),right=Date.parse(b.recordedAt);
 if(left===right&&JSON.stringify(a)!==JSON.stringify(b))fail(`${label}の同時刻の記録が食い違っています。`);
 return left>=right?a:b;
}
// Sequential consumption keeps only asset descriptors/statistics, never all decoded pixels.
export function createCompleteReviewAnalysis({onAsset=async()=>{},decode}={}){
 const groups=new Map(),images=new Map(),reviews=new Map(),assets=new Map(),cache=new Map();
 async function consume(value){
  const bundle=await validateCompleteBundle(value),group=bundle.group;
  const header={...group,sourceImageDataUrl:null,sourcePhotoAssetId:group.input?`source_photo-${group.input.sourceSha256}`:null};
  const previousGroup=groups.get(group.id);
  if(previousGroup&&(JSON.stringify(previousGroup.input)!==JSON.stringify(header.input)||previousGroup.sourcePhotoAssetId!==header.sourcePhotoAssetId))fail('同じ比較組の入力条件が食い違っています。');
  groups.set(group.id,previousGroup&&Date.parse(previousGroup.capturedAt)<Date.parse(header.capturedAt)?previousGroup:header);
  for(let start=0;start<bundle.images.length;start+=3){
   const request=await diagnosticRequest(bundle,bundle.images.slice(start,start+3).map(x=>x.id)),diagnostics=analyzePngAssets(request,{cache,...(decode?{decode}:{})});
   for(const asset of request.assets){
    if(!assets.has(asset.assetId)){
     const {dataUrl,...descriptor}=asset,diagnostic=diagnostics.assets.find(x=>x.assetId===asset.assetId);
     await onAsset({...descriptor,path:`assets/${asset.sha256}.png`},Buffer.from(dataUrl.slice(22),'base64'));
     assets.set(asset.assetId,{...descriptor,path:`assets/${asset.sha256}.png`,diagnostic});
    }
   }
  }
  for(const image of bundle.images){
   const {result,observation,...metadata}=image,{imageDataUrl,...properties}=result;
   const value={...metadata,result:properties,assetId:`complete_thumbnail-${image.imageSha256}`},previous=images.get(image.id);
   if(previous){const {observation:old,...frozen}=previous;if(JSON.stringify(frozen)!==JSON.stringify(value))fail('同じ完成画像IDの内容が食い違っています。');}
   else if([...images.values()].some(x=>x.groupId===image.groupId&&x.imageSha256===image.imageSha256))fail('同じ組で同じPNGが別IDになっています。比較枚数を重複して数えません。');
   const combined=latest(previous?.observation,observation,'実費・保存結果');images.set(image.id,{...value,...(combined?{observation:combined}:{})});
  }
  if(bundle.review)reviews.set(group.id,latest(reviews.get(group.id),bundle.review,'人の比較'));
 }
 function finish(){
  const state={groups:[...groups.values()],images:[...images.values()],reviews:[...reviews.values()]},pending=[],eligible=[],byReviewer={};
  for(const group of state.groups){
   const candidates=state.images.filter(x=>x.groupId===group.id),review=reviews.get(group.id),source=group.sourcePhotoAssetId?assets.get(group.sourcePhotoAssetId):null;
   let reason=null;
   if(!group.input)reason='unknown_input';
   else if(source?.diagnostic.status!=='analyzed'||candidates.some(x=>assets.get(x.assetId)?.diagnostic.status!=='analyzed'))reason='unavailable_image';
   else if(candidates.length<2)reason='need_multiple_images';
   else if(!review)reason='review_missing';
   else if(review.displayWidths.length!==candidates.length||!candidates.every(x=>review.displayWidths.some(w=>w.imageId===x.id)))reason='stale_review';
   else if(!review.context)reason='reviewer_missing';
   if(reason){pending.push({groupId:group.id,reason});continue;}
   eligible.push({groupId:group.id,review});const id=review.context.reviewerId;byReviewer[id]=(byReviewer[id]??0)+1;
  }
  const authorized=eligible.filter(x=>['original','external'].includes(x.review.context.titleSource)&&x.review.context.titlePermissionConfirmed&&x.review.context.photoPermissionConfirmed),issues={text:0,subject:0,composition:0,other:0};
  for(const {review}of eligible)for(const issue of review.issues)issues[issue]++;
  return {version:'complete-evaluation-dataset-1.0.0',analysisVersion:ANALYSIS_VERSION,assessment:null,assets:[...assets.values()],groups:state.groups,images:state.images,reviews:state.reviews,summary:gallerySummary(state),progress:{target:20,completedHumanComparisons:eligible.length,authorizedRealComparisons:authorized.length,byReviewer,pending},humanOutcomes:{selected:eligible.filter(x=>x.review.decision==='selected').length,allRejected:eligible.filter(x=>x.review.decision==='none_acceptable').length,issues},scoringAgreement:null,limitations:['寸法・破損・相対輝度の診断だけです。完成PNGの文字・人物保持・構図の品質スコアは未実装です。','採点との順位一致は未算出です。人の記録や出典・許諾を自動で補いません。','費用と時間は書き出された画像の分だけです。失敗したAPI試行を含む成功率・累計支出ではありません。']};
 }
 return {consume,finish};
}
