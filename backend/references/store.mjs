import {readFile,writeFile,mkdir,rename,unlink,readdir,stat,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ApiError} from '../../shared/contracts.mjs';
import {referenceCriteria,qualifiesReference,thumbnailUrl,collectYouTubeReferences,createYouTubeClient} from './youtube.mjs';
import {youtubeApiKey} from './settings.mjs';
export const REFERENCE_ROOT=new URL('../../data/private/recent-thumbnail-library/',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),idPattern=/^[A-Za-z0-9_-]{11}$/,shaPattern=/^[a-f0-9]{64}$/;
export const REFERENCE_GENRES=['travel','daily_life','routine','experience','explanation','cooking','fitness','beauty'];
export const REFERENCE_MOODS=['calm','friendly','energetic','refined','cinematic','playful','clear'];
export const REFERENCE_MATERIALS=['scene','cutout','multi_photo','illustration'];
const text=(value,max)=>typeof value==='string'&&!!value.trim()&&[...value].length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);
export function validateReferenceObservation(value){
 if(!value||Object.keys(value).some(key=>!['videoId','thumbnailSha256','genres','moods','material','typography','layout','when','avoid','generationAllowed','permissionBasis','observer'].includes(key))||!idPattern.test(value.videoId??'')||!shaPattern.test(value.thumbnailSha256??'')||value.observer!==undefined&&!['human','assistant'].includes(value.observer))throw new ApiError(400,'INVALID_REFERENCE','出典と確認した画像を指定してください。');
 for(const [key,allowed]of [['genres',REFERENCE_GENRES],['moods',REFERENCE_MOODS]])if(!Array.isArray(value[key])||value[key].length<1||value[key].length>allowed.length||new Set(value[key]).size!==value[key].length||value[key].some(x=>!allowed.includes(x)))throw new ApiError(400,'INVALID_REFERENCE','ジャンルと雰囲気を選んでください。');
 if(!REFERENCE_MATERIALS.includes(value.material)||['typography','layout','when','avoid'].some(key=>!text(value[key],500))||typeof value.generationAllowed!=='boolean'||value.generationAllowed&&!text(value.permissionBasis,300))throw new ApiError(400,'INVALID_REFERENCE','実画像で確認した字体・配置・使う条件・避ける条件を記録してください。画像送信を許可する場合は根拠も必要です。');
 return {videoId:value.videoId,thumbnailSha256:value.thumbnailSha256,observer:value.observer??'human',genres:[...value.genres],moods:[...value.moods],material:value.material,typography:value.typography.trim(),layout:value.layout.trim(),when:value.when.trim(),avoid:value.avoid.trim(),generationAllowed:value.generationAllowed,permissionBasis:value.generationAllowed?value.permissionBasis.trim():null};
}
export function imageHeader(bytes,mime){
 if(mime==='image/png'&&bytes.length>=24&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.toString('ascii',12,16)==='IHDR')return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),extension:'png'};
 if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){for(let at=2;at+4<bytes.length;){if(bytes[at++]!==255)break;while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217||marker===218)break;const length=bytes.readUInt16BE(at);if(length<2||at+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return {width:bytes.readUInt16BE(at+5),height:bytes.readUInt16BE(at+3),extension:'jpg'};at+=length;}}
 throw new ApiError(502,'REFERENCE_IMAGE_FORMAT','参考画像のPNG/JPEG形式を確認できませんでした。');
}
export function freshReferenceMetadata(record,now=new Date()){
 return !!record?.metadata&&Date.parse(record.metadata.checkedAt)<=+now&&+now-Date.parse(record.metadata.checkedAt)<30*86400000&&qualifiesReference(record.metadata,referenceCriteria(now));
}
export function referenceSummary(catalog,now=new Date()){
 const records=catalog.records??[],qualified=records.filter(row=>freshReferenceMetadata(row,now)),observed=qualified.filter(row=>row.observation&&row.asset&&row.observation.thumbnailSha256===row.asset.sha256);
 return {target:100,metadataQualified:qualified.length,visuallyObserved:observed.length,imageUploadAllowed:observed.filter(row=>row.imageUse?.generationAllowed).length,channels:new Set(qualified.map(row=>row.metadata.channelId)).size,complete:observed.length>=100,collectedAt:catalog.collectedAt??null,criteria:catalog.criteria??referenceCriteria(now),collection:catalog.collection??null};
}
export function createReferenceStore({root=REFERENCE_ROOT,fetchImpl=globalThis.fetch,clock=()=>new Date()}={}){
 let queue=Promise.resolve(),collecting=false,progress=null;
 const path=new URL('catalog.json',root),assets=new URL('assets/',root);
 const assetPath=asset=>{if(!shaPattern.test(asset?.sha256??'')||!['jpg','png'].includes(asset.extension))throw new Error('Invalid stored image reference.');return new URL(asset.sha256+'.'+asset.extension,assets);};
 async function read(){let catalog;try{catalog=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code==='ENOENT')return {version:'thumbnail-reference-catalog-1.0.0',records:[]};throw new ApiError(500,'REFERENCE_CATALOG','参考台帳を読めません。上書きせず停止しました。');}
  if(catalog.version!=='thumbnail-reference-catalog-1.0.0'||!Array.isArray(catalog.records)||catalog.records.length>500||new Set(catalog.records.map(row=>row.videoId)).size!==catalog.records.length||catalog.records.some(row=>!idPattern.test(row.videoId??'')||row.metadata&&row.metadata.videoId!==row.videoId))throw new ApiError(500,'REFERENCE_CATALOG','参考台帳の形式を確認してください。');
  try{for(const row of catalog.records){if(row.metadata){const m=row.metadata;if(!/^UC[A-Za-z0-9_-]{22}$/.test(m.channelId??'')||m.url!=='https://www.youtube.com/watch?v='+row.videoId||typeof m.title!=='string'||m.title.length>500||!Number.isFinite(m.durationSeconds)||!/^\d{1,30}$/.test(m.viewCount??'')||!Number.isFinite(Date.parse(m.checkedAt)))throw new Error();thumbnailUrl(m.thumbnailUrl,row.videoId);}if(row.asset){assetPath(row.asset);const a=row.asset;if(!['image/png','image/jpeg'].includes(a.mimeType)||a.extension!==(a.mimeType==='image/png'?'png':'jpg')||!Number.isInteger(a.bytes)||a.bytes<24||a.bytes>2*1024*1024||!Number.isFinite(Date.parse(a.cachedAt)))throw new Error();}if(row.observation){const {version,method,observedAt,...features}=row.observation;if(version!=='thumbnail-reference-observation-1.0.0'||method!=='visual_record'||!Number.isFinite(Date.parse(observedAt)))throw new Error();validateReferenceObservation({...features,videoId:row.videoId,generationAllowed:row.imageUse?.generationAllowed,permissionBasis:row.imageUse?.basis});}}}catch{throw new ApiError(500,'REFERENCE_CATALOG','参考台帳の観察記録・画像参照を確認してください。');}return catalog;
 }
 async function save(catalog){await mkdir(root,{recursive:true});const temporary=new URL('catalog.next.json',root);await writeFile(temporary,JSON.stringify(catalog,null,2)+'\n');await rename(temporary,path);}
 async function locked(fn){await mkdir(root,{recursive:true});const lock=new URL('catalog.lock',root);let handle;for(let attempt=0;attempt<100;attempt++){try{handle=await open(lock,'wx');break;}catch(error){if(error.code!=='EEXIST')throw error;await new Promise(resolve=>setTimeout(resolve,50));}}if(!handle)throw new ApiError(409,'REFERENCE_BUSY','参考台帳を別の処理が更新中です。しばらくして再試行してください。');try{return await fn();}finally{await handle.close();await unlink(lock);}}
 function mutate(fn){const result=queue.then(()=>locked(async()=>{const catalog=await read(),value=await fn(catalog);await save(catalog);return value;}));queue=result.catch(()=>{});return result;}
 async function expire(){return mutate(async catalog=>{const expired=date=>!Number.isFinite(Date.parse(date))||+clock()-Date.parse(date)>=30*86400000;
  for(const row of catalog.records){if(row.metadata&&expired(row.metadata.checkedAt))row.metadata=null;if(row.asset&&(!row.metadata||expired(row.asset.cachedAt))){await unlink(assetPath(row.asset)).catch(error=>{if(error.code!=='ENOENT')throw error;});row.asset=null;}}
  for(const name of await readdir(assets).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){if(!/^[a-f0-9]{64}\.(jpg|png)$/.test(name))continue;const file=new URL(name,assets),info=await stat(file);if(+clock()-info.mtimeMs>=30*86400000)await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});}return catalog;});}
 async function list(){const catalog=await expire();return {version:catalog.version,...referenceSummary(catalog,clock()),collecting,progress,records:catalog.records.map(row=>({...row,eligible:freshReferenceMetadata(row,clock())}))};}
 async function collect(options={}){if(collecting)throw new ApiError(409,'REFERENCE_BUSY','参考の収集が進行中です。');collecting=true;progress=null;
  try{const previous=await read(),catalog=await collectYouTubeReferences({...options,client:createYouTubeClient({apiKey:await youtubeApiKey(),fetchImpl}),existingMetadata:previous.records.filter(row=>row.metadata).map(row=>row.metadata),criteria:referenceCriteria(clock()),now:()=>clock().toISOString(),onProgress:value=>{progress=value;}});
   await mutate(async current=>{for(const row of catalog.records){const old=current.records.find(x=>x.videoId===row.videoId)??previous.records.find(x=>x.videoId===row.videoId);if(old){row.observation=old.observation??null;row.asset=old.asset??null;row.imageUse=old.imageUse??row.imageUse;}}Object.assign(current,catalog);});collecting=false;return await list();
  }finally{collecting=false;}
 }
 async function thumbnail(videoId){if(!idPattern.test(videoId??''))throw new ApiError(400,'INVALID_REFERENCE','動画IDが不正です。');
  const catalog=await expire(),row=catalog.records.find(r=>r.videoId===videoId);if(!freshReferenceMetadata(row,clock()))throw new ApiError(404,'REFERENCE_UNAVAILABLE','最近・再生数の条件を再確認してください。');
   if(row.asset){try{const bytes=await readFile(assetPath(row.asset));if(hash(bytes)===row.asset.sha256)return {...row.asset,bytes};}catch(error){if(error.code!=='ENOENT')throw error;}}
   const url=thumbnailUrl(row.metadata.thumbnailUrl,videoId);let response;try{response=await fetchImpl(url,{signal:AbortSignal.timeout(10000),redirect:'error'});}catch{throw new ApiError(502,'REFERENCE_IMAGE_NETWORK','参考画像を取得できませんでした。');}if(!response.ok){await response.body?.cancel();throw new ApiError(502,'REFERENCE_IMAGE_NETWORK','参考画像を取得できませんでした。');}
   const mime=response.headers.get('content-type')?.split(';')[0],chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>2*1024*1024)throw new ApiError(413,'REFERENCE_IMAGE_SIZE','参考画像は2MiBまでです。');chunks.push(Buffer.from(chunk));}
   const bytes=Buffer.concat(chunks),header=imageHeader(bytes,mime);if(header.width<100||header.height<50||header.width>3840||header.height>2160)throw new ApiError(502,'REFERENCE_IMAGE_FORMAT','参考画像の寸法を確認してください。');const asset={sha256:hash(bytes),bytes:bytes.length,mimeType:mime,...header,cachedAt:clock().toISOString()};await mkdir(assets,{recursive:true});await writeFile(assetPath(asset),bytes);
   await mutate(async current=>{const record=current.records.find(r=>r.videoId===videoId);if(!freshReferenceMetadata(record,clock())||record.metadata.thumbnailUrl!==url)throw new ApiError(409,'REFERENCE_CHANGED','取得中に参考の情報が変わりました。開き直してください。');if(record.asset?.sha256!==asset.sha256){record.observation=null;record.imageUse={generationAllowed:false,basis:null};}record.asset=asset;});return {...asset,bytes};
 }
 async function observe(value){const observation=validateReferenceObservation(value);return mutate(async catalog=>{const row=catalog.records.find(r=>r.videoId===observation.videoId);if(!freshReferenceMetadata(row,clock())||row.asset?.sha256!==observation.thumbnailSha256)throw new ApiError(409,'REFERENCE_CHANGED','確認した参考画像と台帳が一致しません。画像を開き直してください。');
   const {generationAllowed,permissionBasis,videoId,...features}=observation;row.observation={version:'thumbnail-reference-observation-1.0.0',method:'visual_record',observedAt:clock().toISOString(),...features};row.imageUse={generationAllowed,basis:permissionBasis};return row;
  });}
 async function snapshot(){const catalog=await expire();return {catalog,summary:referenceSummary(catalog,clock()),async bytesFor(row){const bytes=await readFile(assetPath(row.asset));if(hash(bytes)!==row.asset.sha256)throw new ApiError(409,'REFERENCE_CHANGED','参考画像のハッシュが変わりました。画像を再確認してください。');return bytes;}};}
 return {list,collect,thumbnail,observe,snapshot};
}
export const referenceStore=createReferenceStore();
