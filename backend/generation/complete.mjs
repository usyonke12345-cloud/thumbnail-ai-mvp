import {ApiError} from '../../shared/contracts.mjs';
import {generateBackground} from './openai.mjs';
export const COMPLETE_GENERATION_VERSION='ai-complete-0.2.0';
export function validateComplete(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['title','brief','headline','headlineMode','design','imageDataUrl','consent','composition'].includes(k)))throw new ApiError(400,'INVALID_INPUT','完成画像の入力形式が不正です。');
 if(value.consent!==true)throw new ApiError(400,'CONSENT_REQUIRED','写真のAPI送信と有料生成を確認してください。');
 const headlineMode=value.headlineMode??'manual',design=value.design??'auto';
 if(!['auto','manual'].includes(headlineMode)||!['auto','photo_focus','editorial','impact'].includes(design))throw new ApiError(400,'INVALID_INPUT','見出しとデザインの指定を確認してください。');
 for(const [key,max]of [['title',120],['brief',1000],...(headlineMode==='manual'?[['headline',80]]:[])])if(typeof value[key]!=='string'||!value[key].trim()||[...value[key]].length>max||/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(value[key]))throw new ApiError(400,'INVALID_INPUT','タイトル・動画内容・見出しを確認してください。');
 if(headlineMode==='auto'&&value.headline!==undefined&&value.headline!==null&&value.headline!=='')throw new ApiError(400,'INVALID_INPUT','自動見出しでは見出しを空欄にしてください。');
 if(typeof value.imageDataUrl!=='string'||value.imageDataUrl.length>3*1024*1024||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.imageDataUrl))throw new ApiError(400,'INVALID_IMAGE','3MB以内のPNGデータを指定してください。');
 const image=Buffer.from(value.imageDataUrl.split(',')[1],'base64');
 if(image.length<24||!image.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))||image.toString('ascii',12,16)!=='IHDR'||image.readUInt32BE(16)!==1280||image.readUInt32BE(20)!==720)throw new ApiError(400,'INVALID_IMAGE','1280×720のPNG写真を指定してください。');
 const composition=value.composition??'auto';if(!['auto','text_left','text_right','text_top'].includes(composition))throw new ApiError(400,'INVALID_INPUT','AIの構図指定が不正です。');
 return {...value,headline:headlineMode==='auto'?null:value.headline,headlineMode,design,composition,complete:true};
}
export async function generateComplete(value){const input=validateComplete(value);return {apiVersion:'1',mode:'ai_complete',imageDataUrl:await generateBackground(input),width:1536,height:864,generation_version:COMPLETE_GENERATION_VERSION,limitations:['画像内の文字と人物の保持は目視確認が必要です。','画像内容・文字位置・CTRは未採点です。',...(input.headlineMode==='auto'?['見出しは画像生成時にAIが選びます。実際の文言は未取得のため、画像を見て確認してください。']:[])]};}

