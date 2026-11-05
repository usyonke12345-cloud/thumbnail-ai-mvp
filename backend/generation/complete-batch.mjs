import {ApiError} from '../../shared/contracts.mjs';
import {validateComplete,completeResult} from './complete.mjs';
import {prepareCompleteReferences} from '../references/selection.mjs';
import {generateBackground} from './openai.mjs';

const directions=[
 {label:'写真を大きく見せる',design:'photo_focus',composition:'text_left'},
 {label:'落ち着いた誌面風',design:'editorial',composition:'text_top'},
 {label:'文字と写真を左右に見せる',design:'auto',composition:'text_right'}
];

export async function generateCompleteBatch(value,{references,generateBatch=inputs=>generateBackground.batch(inputs)}={}){
 const base=validateComplete(value);
 const variants=directions.map((direction,index)=>({
  index,label:base.design==='auto'&&base.composition==='auto'?direction.label:`指定を生かした案${index+1}`,
  settings:{design:base.design==='auto'?direction.design:base.design,composition:base.composition==='auto'?direction.composition:base.composition}
 }));
 // Finish every validation/reference lookup before reserving paid image attempts.
 const inputs=[];
 for(const variant of variants){
  inputs.push(await prepareCompleteReferences({...base,...variant.settings},references));
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
