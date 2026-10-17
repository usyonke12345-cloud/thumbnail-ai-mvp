import {ApiError} from '../../shared/contracts.mjs';
import {generateBackground} from './openai.mjs';
import {normalizeVisualIntent,normalizeVideoBrief} from '../../shared/complete-designs.mjs';
import {isCompletePngDataUrl} from '../../shared/complete-images.mjs';
import {createHash} from 'node:crypto';
import {normalizeGenerationFeedback} from '../../shared/generation-feedback.mjs';
import {splitFromDigest} from '../../shared/evaluation-split.mjs';
export const COMPLETE_GENERATION_VERSION='ai-complete-0.7.0';
export function validateComplete(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['title','brief','headline','headlineMode','design','visualIntent','imageDataUrl','consent','composition','revision','feedback'].includes(k)))throw new ApiError(400,'INVALID_INPUT','完成画像の入力形式が不正です。');
 if(value.consent!==true)throw new ApiError(400,'CONSENT_REQUIRED','写真のAPI送信と有料生成を確認してください。');
 const headlineMode=value.headlineMode??'manual',design=value.design??'auto';
 if(!['auto','manual'].includes(headlineMode)||!['auto','photo_focus','editorial','impact'].includes(design))throw new ApiError(400,'INVALID_INPUT','見出しとデザインの指定を確認してください。');
 for(const [key,max]of [['title',120],...(headlineMode==='manual'?[['headline',80]]:[])])if(typeof value[key]!=='string'||!value[key].trim()||[...value[key]].length>max||/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value[key]))throw new ApiError(400,'INVALID_INPUT','動画タイトルと、手入力の場合の見出しを確認してください。');
 if(headlineMode==='auto'&&value.headline!==undefined&&value.headline!==null&&value.headline!=='')throw new ApiError(400,'INVALID_INPUT','自動見出しでは見出しを空欄にしてください。');
 if(typeof value.imageDataUrl!=='string'||value.imageDataUrl.length>3*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.imageDataUrl))throw new ApiError(400,'INVALID_IMAGE','3MB以内のPNGデータを指定してください。');
 const image=Buffer.from(value.imageDataUrl.split(',')[1],'base64');
 if(image.length<24||!image.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||image.toString('ascii',12,16)!=='IHDR'||image.readUInt32BE(16)!==1280||image.readUInt32BE(20)!==720)throw new ApiError(400,'INVALID_IMAGE','1280×720のPNG写真を指定してください。');
 const composition=value.composition??'auto';if(!['auto','text_left','text_right','text_top'].includes(composition))throw new ApiError(400,'INVALID_INPUT','AIの構図指定が不正です。');
 if(value.revision!==undefined){
  const r=value.revision;if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['instruction','imageDataUrl','parentImageId'].includes(k))||typeof r.instruction!=='string'||!r.instruction.trim()||[...r.instruction].length>300||/[\u0000-\u001f\u007f]/u.test(r.instruction)||typeof r.parentImageId!=='string'||!r.parentImageId.trim()||[...r.parentImageId].length>200||/[\u0000-\u001f\u007f]/u.test(r.parentImageId)||!isCompletePngDataUrl(r.imageDataUrl))throw new ApiError(400,'INVALID_REVISION','修正指示と16MiB以下の元の完成PNGを確認してください。');
  const previous=Buffer.from(r.imageDataUrl.slice(22),'base64');if(previous.length<24||!previous.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||previous.toString('ascii',12,16)!=='IHDR'||previous.readUInt32BE(16)!==1536||previous.readUInt32BE(20)!==864)throw new ApiError(400,'INVALID_REVISION','修正元は1536×864の完成PNGを指定してください。');
 }
 let visualIntent,brief;try{visualIntent=normalizeVisualIntent(value.visualIntent);brief=normalizeVideoBrief(value.brief);}catch(error){throw new ApiError(400,'INVALID_INPUT',error.message);}
 let feedback;try{if(value.feedback!==undefined){feedback=normalizeGenerationFeedback(value.feedback);if(feedback.records.some(record=>splitFromDigest(createHash('sha256').update(record.groupId).digest())==='holdout'))throw new Error('holdoutの評価は生成のメモへ使えません。devの記録を選んでください。');}}catch(error){throw new ApiError(400,'INVALID_FEEDBACK',error.message);}
 return {...value,brief,...(feedback?{feedback}:{}),...(value.visualIntent!==undefined?{visualIntent}:{}),headline:headlineMode==='auto'?null:value.headline,headlineMode,design,composition,complete:true};
}
export async function generateComplete(value,{generate=generateBackground}={}){
 const input=validateComplete(value),revision=input.revision?{parentImageId:input.revision.parentImageId,parentImageSha256:createHash('sha256').update(Buffer.from(input.revision.imageDataUrl.slice(22),'base64')).digest('hex')}:null;
 const feedbackApplied=input.feedback?normalizeGenerationFeedback(input.feedback):null;
 return {apiVersion:'1',mode:'ai_complete',imageDataUrl:await generate(input),width:1536,height:864,generation_version:COMPLETE_GENERATION_VERSION,...(feedbackApplied?{feedbackApplied}:{}),...(revision?{revision}:{}),limitations:['画像内の文字と人物の保持は目視確認が必要です。','画像内容・文字位置・CTRは未採点です。',...(feedbackApplied?['保存された評価メモを生成指示へ加えました。モデルの重みは更新せず、反映や品質向上は目視確認が必要です。']:[]),...(input.headlineMode==='auto'?['見出しは画像生成時にAIが選びます。実際の文言は未取得のため、画像を見て確認してください。']:[]),...(input.design==='auto'?['デザインは写真と動画内容からAIが選び、指定した構図がある場合は優先します。実際の字体・位置・選択理由は取得していません。']:[])]};
}

