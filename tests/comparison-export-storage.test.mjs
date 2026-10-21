import test from 'node:test';
import assert from 'node:assert/strict';
import {galleryStorage,packGallery} from '../frontend/complete-gallery-store.js';

test('the export snapshot uses a readonly IndexedDB transaction without migrating or rewriting any record',async()=>{
 const state={groups:[{id:'synthetic-group',input:{sourceSha256:'source'},sourceImageDataUrl:'synthetic-source'}],images:[{id:'synthetic-image',groupId:'synthetic-group',imageSha256:'result',result:{imageDataUrl:'synthetic-result'}}],reviews:[]},raw=packGallery(state),before=structuredClone(raw),modes=[];let closed=0;
 const previous=globalThis.indexedDB;
 globalThis.indexedDB={open(){const request={};queueMicrotask(()=>{request.result={close(){closed++;},transaction(names,mode){modes.push(mode);let pending=names.length;const tx={objectStore(name){return {getAll(){const r={};queueMicrotask(()=>{r.result=structuredClone(raw[name]);r.onsuccess();if(--pending===0)queueMicrotask(()=>tx.oncomplete());});return r;},put(){assert.fail('Export must not write');},delete(){assert.fail('Export must not delete');}};}};return tx;}};request.onsuccess();});return request;}};
 try{assert.deepEqual(await galleryStorage.loadForExport(),state);assert.deepEqual(modes,['readonly']);assert.equal(closed,1);assert.deepEqual(raw,before);}finally{if(previous===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=previous;}
});
