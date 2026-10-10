import {createHash} from 'node:crypto';
import {decodePng, MAX_INPUT_BYTES} from '../scoring/png.mjs';
import {regionStats, isNearlyUniform} from '../scoring/image-stats.mjs';
import {ApiError} from '../../shared/contracts.mjs';

export const ANALYSIS_VERSION='complete-png-diagnostics-0.1.0';
export const MAX_ASSETS=4, MAX_ASSET_BYTES=32*1024*1024, MAX_JSON_BYTES=45*1024*1024;
export const UNEVALUATED=['rendered_text','readability','text_fit','text_contrast','subject_preservation','composition_quality'];
const invalid=message=>{throw new ApiError(400,'INVALID_DIAGNOSTIC_INPUT',message);};
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
const nullableText=(value,max)=>value===null||typeof value==='string'&&[...value].length<=max;

// Restrict formats the partner decoder can interpret without guessing transparency.
function supportedEncoding(bytes){
 if(bytes.length<33)return;
 if(bytes.readUInt32BE(16)>4096||bytes.readUInt32BE(20)>4096)throw new Error('実寸法が対応範囲外です。');
 if(bytes[26]!==0||bytes[27]!==0)throw new Error('PNGの圧縮・フィルタ方式に未対応です。');
 let pos=8;
 while(pos+12<=bytes.length){
  const length=bytes.readUInt32BE(pos),type=bytes.toString('latin1',pos+4,pos+8);
  if(pos+12+length>bytes.length)return; // The decoder supplies the corruption reason.
  if(type==='tRNS'&&[0,2].includes(bytes[25]))throw new Error('グレースケール・RGBのtRNS透明色に未対応です。');
  if(type[0]===type[0]?.toUpperCase()&&!['IHDR','PLTE','IDAT','IEND'].includes(type))throw new Error('未対応の必須PNGチャンクがあります。');
  pos+=12+length;
 }
}

// Local diagnostics only. Images are never passed to generation or external services.
export function analyzePngAssets(body,{decode=decodePng,stats=regionStats,cache=new Map()}={}){
 if(!keys(body,['assetVersion','assets','images'])||body.assetVersion!=='image-assets-1.0.0'||!Array.isArray(body.assets)||body.assets.length<1||body.assets.length>MAX_ASSETS||!Array.isArray(body.images)||body.images.length<1||body.images.length>MAX_ASSETS)invalid('画像資産の版・件数を確認してください（最大4資産）。');
 const assets=new Map(),images=new Set();let totalBytes=0;
 for(const asset of body.assets){
  if(!keys(asset,['assetId','role','sha256','mimeType','width','height','byteLength','dataUrl'])||!id(asset.assetId)||assets.has(asset.assetId)||!['source_photo','complete_thumbnail'].includes(asset.role)||asset.mimeType!=='image/png'||!/^[a-f0-9]{64}$/.test(asset.sha256)||![asset.width,asset.height].every(n=>Number.isInteger(n)&&n>0&&n<=4096)||!Number.isInteger(asset.byteLength)||asset.byteLength<24||asset.byteLength>MAX_INPUT_BYTES||typeof asset.dataUrl!=='string'||asset.dataUrl.length>Math.ceil(MAX_INPUT_BYTES/3)*4+22||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl))invalid('画像資産の形式・寸法・上限が不正です。');
  const encoded=asset.dataUrl.slice(22);if(encoded.length%4)invalid('PNGのbase64形式が不正です。');
  const bytes=Buffer.from(encoded,'base64');if(bytes.length!==asset.byteLength||bytes.toString('base64')!==encoded||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)invalid('PNGのバイト数またはSHA-256が一致しません。');
  totalBytes+=bytes.length;if(totalBytes>MAX_ASSET_BYTES)invalid('PNGの合計は32MiB以下にしてください。');
  assets.set(asset.assetId,{asset,bytes});
 }
 const referenced=new Set();
 for(const image of body.images){
  if(!keys(image,['imageId','assetId','role','generationVersion','sourcePhotoAssetId','backgroundAssetId','headlineProvided','renderedTextVerified','textRegions'])||!id(image.imageId)||images.has(image.imageId)||image.role!=='complete_thumbnail'||assets.get(image.assetId)?.asset.role!=='complete_thumbnail'||!nullableText(image.generationVersion,100)||!nullableText(image.headlineProvided,80)||image.backgroundAssetId!==null||image.renderedTextVerified!==false||image.textRegions!==null||!(image.sourcePhotoAssetId===null||assets.get(image.sourcePhotoAssetId)?.asset.role==='source_photo'))invalid('完成PNGの参照・役割を確認してください。文字なし背景や検出した文字は推測で指定できません。');
  images.add(image.imageId);referenced.add(image.assetId);if(image.sourcePhotoAssetId!==null)referenced.add(image.sourcePhotoAssetId);
 }
 if(referenced.size!==assets.size)invalid('参照されていない画像資産があります。');
 const results=[];let decodedImages=0;
 for(const {asset,bytes}of assets.values()){
  if(!cache.has(asset.sha256)){
   let value;
   try{
    supportedEncoding(bytes);const decoded=decode(bytes);decodedImages++;
    // The decoder's pixel limit is complemented by a per-axis check.
    if(decoded.width>4096||decoded.height>4096)throw new Error('実寸法が対応範囲外です。');
    const sampleStep=Math.max(2,Math.ceil(Math.sqrt(decoded.width*decoded.height/200000))),luminance=stats(decoded,undefined,{step:sampleStep});
    value={status:'analyzed',width:decoded.width,height:decoded.height,luminance,sampleStep,nearlyUniform:luminance?isNearlyUniform(luminance):null,reasons:luminance?['画素の相対輝度を間引いて測定しました。']:['不透明な画素のサンプルがなく、輝度は未評価です。']};
   }catch(error){value={status:'unavailable',width:null,height:null,luminance:null,sampleStep:null,nearlyUniform:null,reasons:[`PNGを解析できません：${error.message}`]};}
   cache.set(asset.sha256,value);
  }
  const value=cache.get(asset.sha256),matches=value.status==='analyzed'&&value.width===asset.width&&value.height===asset.height;
  results.push({assetId:asset.assetId,sha256:asset.sha256,role:asset.role,byteLength:asset.byteLength,...value,...(value.status==='analyzed'&&!matches?{status:'unavailable',luminance:null,nearlyUniform:null,reasons:['宣言寸法と実際のPNG寸法が一致しません。']}:{} )});
 }
 const byId=new Map(results.map(x=>[x.assetId,x]));
 return {analysisVersion:ANALYSIS_VERSION,kind:'image_diagnostics',assessment:null,assets:results,images:body.images.map(image=>({imageId:image.imageId,assetId:image.assetId,sourcePhotoAssetId:image.sourcePhotoAssetId,backgroundAssetId:null,headlineProvided:image.headlineProvided,status:byId.get(image.assetId).status,qualityScore:null,renderedText:null,unevaluated:[...UNEVALUATED],reasons:['見出しは生成指示で、画像内の文字として検証していません。','入力写真を文字なし背景として代用しません。'],limitations:['輝度やほぼ単色という兆候だけで、品質・文字の読みやすさ・人物の保持を採点しません。','輝度は画素値をsRGBと仮定した間引き統計です。色プロファイル変換は行いません。']})),decodedImages,note:'ローカルの画像診断です。外部API送信・追加料金なし。完成PNGの品質スコアとCTR予測は未実装です。'};
}
