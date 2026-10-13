import {addToGallery,validateQualityReview,recordObservation,mergeCompleteImport,projectName,checkGalleryCapacity} from './complete-gallery-model.js';
import {recordSubjectRegions} from './subject-regions.js';
export function unpackGallery(raw){
 const assets=new Map((raw.assets??[]).map(x=>[x.id,x.dataUrl]));
 for(const group of raw.groups)if(group.sourceAssetId&&!assets.has(group.sourceAssetId))throw new Error('保存した入力写真を見つけられません。記録は変更していません。');for(const image of raw.images)if(image.assetId&&!assets.has(image.assetId))throw new Error('保存した完成画像を見つけられません。記録は変更していません。');
 return {groups:raw.groups.map(({sourceAssetId,...g})=>({...g,sourceImageDataUrl:sourceAssetId?assets.get(sourceAssetId):g.sourceImageDataUrl})),images:raw.images.map(({assetId,...image})=>({...image,result:{...image.result,imageDataUrl:assetId?assets.get(assetId):image.result.imageDataUrl}})),reviews:raw.reviews};
}
export function packGallery(state){
 const assets=new Map(),groups=state.groups.map(g=>{const {sourceImageDataUrl,...rest}=g;if(sourceImageDataUrl)assets.set(g.input.sourceSha256,{id:g.input.sourceSha256,dataUrl:sourceImageDataUrl});return {...rest,sourceImageDataUrl:null,...(sourceImageDataUrl?{sourceAssetId:g.input.sourceSha256}:{})};});
 const images=state.images.map(image=>{const {imageDataUrl,...result}=image.result;assets.set(image.imageSha256,{id:image.imageSha256,dataUrl:imageDataUrl});return {...image,assetId:image.imageSha256,result};});return {groups,images,reviews:state.reviews,assets:[...assets.values()]};
}
async function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('thumbnail-complete-gallery',2);r.onupgradeneeded=()=>{for(const name of ['groups','images','reviews','assets'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:name==='reviews'?'groupId':'id'});};r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('別の編集タブを閉じて再度お試しください。'));});}
async function operate(mode,change,metadataOnly=false){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const names=metadataOnly?['groups','images','reviews']:['groups','images','reviews','assets'],tx=db.transaction(names,mode),raw={};let pending=names.length,value,failure;
  tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure??tx.error??new Error('比較記録を保存できませんでした。'));tx.onerror=()=>{};
  for(const name of names){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{raw[name]=request.result;if(--pending===0){try{
   const state=metadataOnly?{groups:raw.groups.map(({sourceImageDataUrl,...group})=>group),images:raw.images.map(({result,...image})=>{const {imageDataUrl,...properties}=result;return {...image,result:properties};}),reviews:raw.reviews}:unpackGallery(raw);value=change?.(state)??state;
   if(mode==='readwrite'){
    const packed=packGallery(value);
    for(const name of ['groups','images','reviews','assets']){
     const key=name==='reviews'?'groupId':'id',old=new Map(raw[name].map(x=>[x[key],x])),keep=new Set(packed[name].map(x=>x[key]));
     for(const item of packed[name]){const previous=old.get(item[key]),changed=name==='assets'?previous?.dataUrl!==item.dataUrl:name==='groups'&&previous?.sourceImageDataUrl||name==='images'&&previous?.result?.imageDataUrl?true:JSON.stringify(previous)!==JSON.stringify(item);if(changed)tx.objectStore(name).put(item);}
     for(const id of old.keys())if(!keep.has(id))tx.objectStore(name).delete(id);
    }
   }
  }catch(error){failure=error;tx.abort();}}};}
 });}finally{db.close();}
}
export const galleryStorage={
 loadFeedback:()=>operate('readonly',undefined,true),
 load:()=>operate('readwrite'),
 add:entry=>operate('readwrite',state=>addToGallery(state,entry)),
 review:review=>operate('readwrite',state=>{const group=state.groups.find(x=>x.id===review.groupId);if(!group)throw new Error('比較する組がありません。');validateQualityReview(review,group,state.images);return {...state,reviews:[...state.reviews.filter(x=>x.groupId!==review.groupId),review]};}),
 observe:(id,value)=>operate('readwrite',state=>recordObservation(state,id,value)),
 subjectRegions:(id,value)=>operate('readwrite',state=>recordSubjectRegions(state,id,value)),
 import:bundles=>operate('readwrite',state=>mergeCompleteImport(state,bundles)),
 rename:(id,name)=>operate('readwrite',state=>{const value=projectName(name);if(!value)throw new Error('案件名を入力してください。');const next={...state,groups:state.groups.map(g=>g.id===id?{...g,projectName:value,projectUpdatedAt:new Date().toISOString()}:g)};checkGalleryCapacity(next);return next;}),
 remove:groupId=>operate('readwrite',state=>({groups:state.groups.filter(x=>x.id!==groupId),images:state.images.filter(x=>x.groupId!==groupId),reviews:state.reviews.filter(x=>x.groupId!==groupId)})),
 clear:()=>operate('readwrite',()=>({groups:[],images:[],reviews:[]}))
};
