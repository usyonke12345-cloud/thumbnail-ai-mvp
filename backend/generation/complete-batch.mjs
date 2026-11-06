import {ApiError} from '../../shared/contracts.mjs';
import {validateComplete,completeResult} from './complete.mjs';
import {prepareCompleteReferences} from '../references/selection.mjs';
import {generateBackground} from './openai.mjs';
import {BATCH_ART_DIRECTIONS} from './complete-batch-directions.mjs';

export async function generateCompleteBatch(value,{references,generateBatch=inputs=>generateBackground.batch(inputs)}={}){
 const base=validateComplete(value);
 const variants=BATCH_ART_DIRECTIONS.map((direction,index)=>({
  index,label:base.design==='auto'?direction.label:`指定を生かす${direction.label}`,
  settings:{design:base.design==='auto'?direction.design:base.design,composition:base.composition}
 }));
 // Finish every validation/reference lookup before reserving paid image attempts.
 const inputs=[];
 for(const variant of variants){
  inputs.push(await prepareCompleteReferences({...base,...variant.settings,_batchDirection:{id:BATCH_ART_DIRECTIONS[variant.index].id,explicitDesign:base.design!=='auto',explicitComposition:base.composition!=='auto'}},references));
 }
 const metadata=inputs.map(input=>completeResult(input,null));
 const results=await generateBatch(inputs);
 if(!Array.isArray(results)||results.length!==3)throw new ApiError(502,'PROVIDER_RESPONSE','3案の生成結果を確認できませんでした。');
 return {
  apiVersion:'1',mode:'ai_complete_batch',
  items:results.map((result,index)=>({
   ...variants[index],elapsedMs:results[index].elapsedMs??null,
   ...(result.status==='fulfilled'?{result:{...metadata[index],imageDataUrl:result.value}}:{error:{
    code:result.reason instanceof ApiError?result.reason.code:'PROVIDER_ERROR',
    message:result.reason instanceof ApiError?result.reason.message:'この案の生成を確認できませんでした。'
   }})
  }))
 };
}
