import test from 'node:test';
import assert from 'node:assert/strict';
import {bundle,png,dataUrl} from './helpers/complete-png.mjs';
import {validateCompleteImport,MAX_IMPORT_BYTES} from '../frontend/complete-png-transfer.js';
import {mergeCompleteImport,comparisonReport,gallerySummary,createEntry,chooseDesign} from '../frontend/complete-gallery-model.js';
import {createCompleteGallery} from '../frontend/complete-gallery.js';
import {galleryStorage} from '../frontend/complete-gallery-store.js';
const empty=()=>({groups:[],images:[],reviews:[]});

test('one-group and report backups restore exact images and historical records, deduplicate and preserve null costs',async()=>{
 const input=await bundle(),sets=await validateCompleteImport(input),state=mergeCompleteImport(empty(),sets);
 assert.deepEqual(state.reviews,[input.review]);assert.equal(gallerySummary(state).collection.humanComparisons,1);
 assert.equal(gallerySummary(state).collection.authorizedRealComparisons,0);
 assert.equal(gallerySummary(state).cost.confirmedTotalUsd,null);
 assert.equal(state.groups[0].sourceImageDataUrl,input.group.sourceImageDataUrl);
 assert.equal(state.images[0].result.imageDataUrl,input.images[0].result.imageDataUrl);
 // UI stores context before displayWidths; export validation uses the reverse order.
 const r=state.reviews[0];state.reviews[0]={version:r.version,groupId:r.groupId,recordedAt:r.recordedAt,decision:r.decision,imageId:r.imageId,reason:r.reason,issues:r.issues,context:r.context,displayWidths:r.displayWidths};
 const twice=mergeCompleteImport(state,await validateCompleteImport(comparisonReport(state)));
 assert.equal(twice.images.length,2);assert.equal(twice.reviews.length,1);
 assert.equal(gallerySummary(twice).collection.humanComparisons,1);
 assert.equal(twice.images[0].observation,undefined);
 const old=structuredClone(input);old.version='complete-comparison-1.1.0';delete old.review.context;
 const historical=mergeCompleteImport(empty(),await validateCompleteImport(old));
 assert.equal(historical.reviews[0].context,undefined);
 assert.equal(gallerySummary(historical).collection.humanComparisons,0);
});

test('newer records survive an older backup; stale review stays stale after an extra image',async()=>{
 const initial=await bundle(),state=mergeCompleteImport(empty(),await validateCompleteImport(initial)),newer=structuredClone(initial);
 newer.images[0].observation={version:1,recordedAt:'2026-10-11T00:00:00Z',costUsd:0,pngSave:'saved'};
 newer.review.recordedAt='2026-10-11T00:00:00Z';newer.review.reason='A later synthetic record';
 const updated=mergeCompleteImport(state,await validateCompleteImport(newer));
 const restored=mergeCompleteImport(updated,await validateCompleteImport(initial));
 assert.equal(restored.reviews[0].reason,newer.review.reason);assert.equal(restored.images[0].observation.costUsd,0);
 const entry=await createEntry({...initial.group.input,imageDataUrl:initial.group.sourceImageDataUrl,composition:'text_top'},{...initial.images[0].result,imageDataUrl:dataUrl(png(1536,864,[90,30,80,255]))},{id:'extra',capturedAt:'2026-10-11T00:01:00Z'});
 const later={...initial,images:[...initial.images,entry.image]};
 const more=mergeCompleteImport(restored,await validateCompleteImport(later));
 assert.equal(gallerySummary(more).staleReviews,1);assert.equal(gallerySummary(more).collection.humanComparisons,0);
});

test('changed hashes, duplicate references, conflicting identity and full capacity reject the whole import',async()=>{
 const b=await bundle(),state=mergeCompleteImport(empty(),await validateCompleteImport(b)),snapshot=structuredClone(state);
 for(const change of [
  x=>x.images[1].imageSha256='0'.repeat(64),
  x=>x.group.input.title='tampered',
  x=>x.review.displayWidths.push({imageId:'foreign',width:246})
 ]){const bad=structuredClone(b);change(bad);await assert.rejects(()=>validateCompleteImport(bad));}
 await assert.rejects(()=>validateCompleteImport({version:'complete-comparison-report-1.0.0',kind:'human_quality_report',assessment:null,sets:[b,b]}),/重複/);
 const conflicting=structuredClone(b);conflicting.images[1].elapsedMs=99;
 assert.throws(()=>mergeCompleteImport(state,[conflicting]),/画像ID/);
 const sameTime=structuredClone(b);sameTime.review.reason='same-time conflict';
 assert.throws(()=>mergeCompleteImport(state,[sameTime]),/同時刻/);
 const distinctId=structuredClone(b);distinctId.review=null;distinctId.images=distinctId.images.map(x=>({...x,id:x.id+'-copy'}));
 assert.throws(()=>mergeCompleteImport(state,[distinctId]),/別の画像ID/);
 const many=await Promise.all(['a','b','c'].map(title=>bundle({title,review:false})));
 const six=mergeCompleteImport(empty(),await validateCompleteImport({version:'complete-comparison-report-1.0.0',kind:'human_quality_report',assessment:null,sets:many}));
 const seventh=await validateCompleteImport(await bundle({title:'seventh',count:1,review:false}));
 assert.throws(()=>mergeCompleteImport(six,seventh),/いっぱい/);assert.equal(six.images.length,6);
 assert.deepEqual(state,snapshot);
});

test('automatic design follows the latest capture, regardless of IndexedDB key or backup order',async()=>{
 const base=await bundle({count:1,review:false}),payload={...base.group.input,headline:null,headlineMode:'auto',imageDataUrl:base.group.sourceImageDataUrl};
 const latest=await createEntry({...payload,design:'editorial'},base.images[0].result,{id:'a-latest',capturedAt:'2026-10-11T00:00:00Z'});
 const older=await createEntry({...payload,design:'photo_focus'},{...base.images[0].result,imageDataUrl:dataUrl(png(1536,864,[100,80,120,255]))},{id:'z-older',capturedAt:'2026-10-10T00:00:00Z'});
 const state={groups:[latest.group],images:[latest.image,older.image],reviews:[]};
 assert.equal(await chooseDesign(state,payload),'impact');
 assert.equal(await chooseDesign({...state,images:[...state.images].reverse()},payload),'impact');
 const imported=mergeCompleteImport(empty(),await validateCompleteImport(comparisonReport(state)));
 assert.equal(await chooseDesign(imported,payload),'impact');assert.equal(imported.groups[0].input.headlineMode,'auto');
});

function domFixture(){
 const all=n=>[n,...n.children.flatMap(all)],document={createElement(tag){return {tag,children:[],attrs:{},style:{},dataset:{},events:{},value:'',disabled:false,checked:false,textContent:'',append(...nodes){this.children.push(...nodes);},prepend(...nodes){this.children.unshift(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.events[k]=fn;},querySelectorAll(tag){return all(this).filter(x=>x!==this&&x.tag===tag);}};}};
 const root=document.createElement('section');return {root,document,find:predicate=>all(root).find(predicate)};
}
test('file picker restores and re-displays backups without diagnostics or generation, and explains invalid files and storage failures',async()=>{
 const dom=domFixture();let state=empty(),writes=0,fail=false,requests=0;
 const storage={async load(){return structuredClone(state);},async import(sets){if(fail)throw new Error('容量不足');state=mergeCompleteImport(state,sets);writes++;return structuredClone(state);}};
 const app=createCompleteGallery({...dom,storage,diagnose:()=>{requests++;throw new Error('must not call');}});await app.ready;
 const file=dom.find(x=>x.attrs['aria-label']==='完成PNG比較JSONを読み込む'),b=await bundle();
 async function select(value){const blob=new Blob([JSON.stringify(value)]);file.files=[blob];await file.events.change();}
 await select(b);assert.equal(state.images.length,2);assert.equal(writes,1);assert.equal(requests,0);
 assert.equal(dom.root.querySelectorAll('img').length,3);assert.equal(dom.find(x=>x.textContent==='この入力写真を保存').href,b.group.sourceImageDataUrl);
 await select(b);assert.equal(state.images.length,2);assert.equal(gallerySummary(state).collection.humanComparisons,1);
 const other=await bundle({title:'Other'});fail=true;await select(other);
 assert.equal(state.images.length,2);assert.ok(dom.root.querySelectorAll('p').some(x=>x.textContent.includes('容量不足')));assert.equal(file.disabled,false);
 fail=false;const before=writes;file.files=[{size:MAX_IMPORT_BYTES+1,text(){throw new Error('must not read');}}];await file.events.change();assert.equal(writes,before);
 assert.ok(dom.root.querySelectorAll('p').some(x=>x.textContent.includes('70MiB')));
 file.files=[new Blob(['{invalid'])];await file.events.change();assert.equal(writes,before);
 assert.ok(dom.root.querySelectorAll('p').some(x=>x.textContent.includes('JSONを読み取れません')));
 file.files=[];await file.events.change();assert.equal(requests,0);
});

// A small transaction double models commit-on-complete and discard-on-abort.
function indexedDbFixture(initial,failWriteAt){
 let saved=structuredClone(initial);
 const api={open(){const request={};queueMicrotask(()=>{request.result={close(){},transaction(){
  const draft=structuredClone(saved);let reads=0,writes=0,aborted=false;
  const tx={error:null,abort(){if(aborted)return;aborted=true;queueMicrotask(()=>tx.onabort?.());},objectStore(name){return {getAll(){const r={};queueMicrotask(()=>{r.result=structuredClone(draft[name]);r.onsuccess?.();if(++reads===3)queueMicrotask(()=>{if(!aborted){saved=draft;tx.oncomplete?.();}});});return r;},put(item){if(++writes===failWriteAt)throw new Error('Simulated quota failure');const key=name==='reviews'?'groupId':'id';draft[name]=draft[name].filter(x=>x[key]!==item[key]);draft[name].push(structuredClone(item));}};}};
  return tx;
 }};request.onsuccess?.();});return request;}};
 return {api,get state(){return saved;}};
}
test('gallery import transaction rolls back all writes on failure and commits a complete batch on success',async()=>{
 const sets=await validateCompleteImport(await bundle()),original=globalThis.indexedDB;
 try{
  const failure=indexedDbFixture(empty(),3);globalThis.indexedDB=failure.api;
  await assert.rejects(()=>galleryStorage.import(sets),/quota/);assert.deepEqual(failure.state,empty());
  const success=indexedDbFixture(empty());globalThis.indexedDB=success.api;
  await galleryStorage.import(sets);assert.equal(success.state.images.length,2);assert.equal(success.state.reviews.length,1);
  await galleryStorage.import(sets);assert.equal(success.state.images.length,2);
 }finally{if(original===undefined)delete globalThis.indexedDB;else globalThis.indexedDB=original;}
});
