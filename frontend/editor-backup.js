import {validateDraft} from './editor-draft.js';
import {writeZip,readZip,utf8,decodeText,hashBytes,fromDataUrl,toDataUrl} from './local-archive.js';
export async function createDraftBackup(value){
 const draft=validateDraft(value),entries=[],files=[];
 for(let i=0;i<draft.files.length;i++){
  const file=draft.files[i];if(!file){files.push(null);continue;}const bytes=new Uint8Array(await file.arrayBuffer()),hash=await hashBytes(bytes),path=`original-${i}-${hash}.${({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[file.type]}`;
  entries.push({name:path,data:bytes});files.push({path,sha256:hash,bytes:bytes.length,type:file.type,name:typeof file.name==='string'?file.name.slice(0,200):`original-${i}`});
 }
 const additionalPhotos=[];for(const [i,item]of (draft.additionalPhotos??[]).entries()){
  const original=new Uint8Array(await item.file.arrayBuffer()),hash=await hashBytes(original),extension=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'})[item.file.type],path=`additional-original-${i}-${hash}.${extension}`;
  entries.push({name:path,data:original});const bytes=fromDataUrl(item.imageDataUrl),sha256=await hashBytes(bytes),inputPath=`additional-input-${i}-${sha256}.png`;entries.push({name:inputPath,data:bytes});
  additionalPhotos.push({file:{path,sha256:hash,bytes:original.length,type:item.file.type,name:typeof item.file.name==='string'?item.file.name.slice(0,200):`additional-${i}`},input:{path:inputPath,sha256,bytes:bytes.length}});
 }
 let result=null;
 if(draft.result){const bytes=fromDataUrl(draft.result.imageDataUrl),sha256=await hashBytes(bytes),path=`completed-${sha256}.png`;entries.push({name:path,data:bytes});const {imageDataUrl,...props}=draft.result;result={...props,path,sha256,bytes:bytes.length};}
 let revision=null;if(draft.revision){const {imageDataUrl,sourceImageDataUrl,...props}=draft.revision,bytes=fromDataUrl(imageDataUrl),sha256=await hashBytes(bytes),path=`revision-${sha256}.png`;entries.push({name:path,data:bytes});revision={...props,reference:{path,sha256,bytes:bytes.length}};if(sourceImageDataUrl){const source=fromDataUrl(sourceImageDataUrl),hash=await hashBytes(source),sourcePath=`revision-source-${hash}.png`;entries.push({name:sourcePath,data:source});revision.sourceReference={path:sourcePath,sha256:hash,bytes:source.length};}}
 const manifest={version:additionalPhotos.length===3?'photo-editor-backup-1.2.0':additionalPhotos.length?'photo-editor-backup-1.1.0':'photo-editor-backup-1.0.0',createdAt:new Date().toISOString(),draft:{...draft,files,result,revision,...(additionalPhotos.length?{additionalPhotos}:{})}};
 entries.push({name:'editor-backup.json',data:utf8(JSON.stringify(manifest,null,2))});entries.push({name:'README.txt',data:utf8('写真エディターの下書きです。元写真・切り取り位置・入力欄・最後の完成画像を含みます。サイトの「下書きZIPを読み込む」から復元してください。比較履歴と生成試行履歴は別の書き出しです。APIキーと有料送信の確認は含みません。写真を含むため非公開で渡してください。')});return writeZip(entries);
}
export async function readDraftBackup(bytes){
 const files=await readZip(bytes),raw=files.get('editor-backup.json');if(!raw||raw.length>16*1024*1024)throw new Error('このアプリの下書きZIPを選んでください。');
 const manifest=JSON.parse(decodeText(raw));if(!['photo-editor-backup-1.0.0','photo-editor-backup-1.1.0','photo-editor-backup-1.2.0'].includes(manifest.version)||!manifest.draft||!Array.isArray(manifest.draft.files)||manifest.draft.files.length!==2||manifest.version!==(manifest.draft.additionalPhotos?.length===3?'photo-editor-backup-1.2.0':manifest.draft.additionalPhotos?.length?'photo-editor-backup-1.1.0':'photo-editor-backup-1.0.0'))throw new Error('下書きZIPの形式が不正です。');
 async function asset(ref,prefix){if(!ref||!ref.path.startsWith(prefix)||!/^[a-z0-9.-]+$/.test(ref.path)||!/^[a-f0-9]{64}$/.test(ref.sha256))throw new Error('下書きの画像参照が不正です。');const value=files.get(ref.path);if(!value||value.length!==ref.bytes||await hashBytes(value)!==ref.sha256)throw new Error('下書きの写真が破損しています。');return value;}
 const draft={...manifest.draft,files:[]};
 for(let i=0;i<2;i++){const ref=manifest.draft.files[i];if(!ref){draft.files.push(null);continue;}const bytes=await asset(ref,`original-${i}-`);if(!['image/png','image/jpeg','image/webp'].includes(ref.type))throw new Error('元写真の形式が不正です。');draft.files.push(typeof File==='function'?new File([bytes],ref.name??`original-${i}`,{type:ref.type}):new Blob([bytes],{type:ref.type}));}
 if(manifest.draft.additionalPhotos!==undefined){const extra=manifest.draft.additionalPhotos;if(!Array.isArray(extra)||extra.length>3)throw new Error('追加写真の件数が不正です。');draft.additionalPhotos=[];for(const [i,item]of extra.entries()){const bytes=await asset(item?.file,`additional-original-${i}-`),input=await asset(item?.input,`additional-input-${i}-`);if(!['image/png','image/jpeg','image/webp'].includes(item.file.type))throw new Error('追加写真の形式が不正です。');draft.additionalPhotos.push({file:new File([bytes],item.file.name??`additional-${i}`,{type:item.file.type}),imageDataUrl:toDataUrl(input)});}}
 if(manifest.draft.result){const ref=manifest.draft.result,bytes=await asset(ref,'completed-');draft.result={...ref,imageDataUrl:toDataUrl(bytes)};}
 if(manifest.draft.revision){const r=manifest.draft.revision;draft.revision={instruction:r.instruction,parentImageId:r.parentImageId,imageDataUrl:toDataUrl(await asset(r.reference,'revision-')),...(r.sourceReference?{sourceImageDataUrl:toDataUrl(await asset(r.sourceReference,'revision-source-'))}:{})};}
 return validateDraft(draft);
}
