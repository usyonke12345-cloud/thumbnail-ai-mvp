import {addToGallery,validateQualityReview,recordObservation} from './complete-gallery-model.js';
async function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('thumbnail-complete-gallery',1);r.onupgradeneeded=()=>{for(const name of ['groups','images','reviews'])r.result.createObjectStore(name,{keyPath:name==='reviews'?'groupId':'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('別の編集タブを閉じて再度お試しください。'));});}
// Read and mutate inside one transaction so simultaneous tabs cannot overwrite a set.
async function operate(mode,change){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(['groups','images','reviews'],mode),state={};let pending=3,value,failure;
  tx.oncomplete=()=>resolve(value??state);tx.onabort=()=>reject(failure??tx.error??new Error('比較記録を保存できませんでした。'));tx.onerror=()=>{};
  for(const name of ['groups','images','reviews']){const request=tx.objectStore(name).getAll();request.onsuccess=()=>{state[name]=request.result;if(--pending===0){try{value=change?.(state,tx)??state;}catch(error){failure=error;tx.abort();}}};}
 });}finally{db.close();}
}
export const galleryStorage={
 load:()=>operate('readonly'),
 add:entry=>operate('readwrite',(state,tx)=>{const next=addToGallery(state,entry);if(next.added){tx.objectStore('groups').put(next.groups.find(x=>x.id===entry.group.id));tx.objectStore('images').put(entry.image);}return next;}),
 review:review=>operate('readwrite',(state,tx)=>{const group=state.groups.find(x=>x.id===review.groupId);if(!group)throw new Error('比較する組がありません。');validateQualityReview(review,group,state.images);tx.objectStore('reviews').put(review);return {...state,reviews:[...state.reviews.filter(x=>x.groupId!==review.groupId),review]};}),
 observe:(imageId,value)=>operate('readwrite',(state,tx)=>{const next=recordObservation(state,imageId,value);tx.objectStore('images').put(next.images.find(x=>x.id===imageId));return next;}),
 remove:groupId=>operate('readwrite',(state,tx)=>{tx.objectStore('groups').delete(groupId);tx.objectStore('reviews').delete(groupId);for(const image of state.images.filter(x=>x.groupId===groupId))tx.objectStore('images').delete(image.id);return {groups:state.groups.filter(x=>x.id!==groupId),images:state.images.filter(x=>x.groupId!==groupId),reviews:state.reviews.filter(x=>x.groupId!==groupId)};}),
 clear:()=>operate('readwrite',(state,tx)=>{for(const name of ['groups','images','reviews'])tx.objectStore(name).clear();return {groups:[],images:[],reviews:[]};})
};
