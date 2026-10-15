import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bundle} from './helpers/complete-png.mjs';
import {subjectRegionsRecord,validateSubjectRegions,recordSubjectRegions,rectFromDrag,createSubjectRegionControls} from '../frontend/subject-regions.js';
import {comparisonBundle,comparisonReport,mergeCompleteImport,gallerySummary} from '../frontend/complete-gallery-model.js';
import {validateCompleteBundle,createCompleteShareZip} from '../frontend/complete-png-transfer.js';
import {comparisonFromZip} from '../frontend/local-archive.js';
import {packGallery,unpackGallery} from '../frontend/complete-gallery-store.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {validateReviewContext} from '../frontend/complete-gallery-model.js';
const sourceRect={x:120,y:100,width:400,height:500},completeRect={x:160,y:120,width:480,height:600},time='2026-10-13T01:00:00.000Z';
async function fixture(){const b=await bundle(),state={groups:[b.group],images:b.images,reviews:[b.review]},record=subjectRegionsRecord(b.group,b.images[0],sourceRect,completeRect,'r01',time);return {b,state,record};}
test('subject selection records bind both exact PNG identities and reject invalid geometry or invented automatic measurements',async()=>{
 const {b,record}=await fixture();assert.deepEqual(validateSubjectRegions(record,b.group,b.images[0]),record);
 for(const change of [{method:'automatic'},{reviewerId:''},{coordinateSystem:'css_pixels'},{recordedAt:'bad'},{version:'unknown'},{extra:1}])assert.throws(()=>validateSubjectRegions({...record,...change},b.group,b.images[0]));
 for(const rect of [{...sourceRect,x:-1},{...sourceRect,x:1000},{...sourceRect,y:300},{...sourceRect,width:0},{...sourceRect,x:.5},{...sourceRect,width:NaN}])assert.throws(()=>validateSubjectRegions({...record,sourcePhoto:{...record.sourcePhoto,rect}},b.group,b.images[0]));
 for(const change of [{sha256:'0'.repeat(64)},{width:1279},{rect:null}])assert.throws(()=>validateSubjectRegions({...record,sourcePhoto:{...record.sourcePhoto,...change}},b.group,b.images[0]));
 assert.throws(()=>validateSubjectRegions(record,{...b.group,input:null},b.images[0]));
});
test('display scaling, reverse drags, scrolling offsets and out-of-image drags produce original image pixel coordinates',()=>{
 const bounds={left:100,top:50,width:640,height:360};
 assert.deepEqual(rectFromDrag({x:300,y:250},{x:200,y:100},1280,720,bounds),{x:200,y:100,width:200,height:300});
 assert.deepEqual(rectFromDrag({x:0,y:0},{x:900,y:600},1280,720,bounds),{x:0,y:0,width:1280,height:720});
 assert.equal(rectFromDrag({x:0,y:0},{x:0,y:0},1280,720,bounds),null);
 assert.equal(rectFromDrag({x:125.25,y:70.25},{x:125.25,y:70.25},1280,720,bounds),null);
 assert.throws(()=>rectFromDrag({x:1,y:1},{x:2,y:2},1280,720,{...bounds,width:0}));
});
test('selection and clearing survive storage, ZIP and analysis while images and human comparison counts remain fixed',async()=>{
 const {b,state,record}=await fixture(),next=recordSubjectRegions(state,b.images[0].id,record),out=comparisonBundle(next,b.group.id);
 assert.equal(out.version,'complete-comparison-1.7.0');assert.equal(comparisonReport(next).version,'complete-comparison-report-1.1.0');assert.deepEqual(unpackGallery(packGallery(next)),next);
 assert.deepEqual(state.images,b.images);assert.equal(next.images[0].result.imageDataUrl,state.images[0].result.imageDataUrl);assert.equal(gallerySummary(next).collection.humanComparisons,gallerySummary(state).collection.humanComparisons);
 const normalized=await validateCompleteBundle(out);assert.deepEqual(normalized.images[0].subjectRegions,record);await assert.rejects(()=>validateCompleteBundle({...out,version:'complete-comparison-1.6.0'}),/1.7.0/);
 const shared=await createCompleteShareZip(comparisonReport(next)),restored=await comparisonFromZip(new Uint8Array(await shared.blob.arrayBuffer()));assert.deepEqual(restored.sets[0].images[0].subjectRegions,record);
 const analysis=createCompleteReviewAnalysis();await analysis.consume(b);await analysis.consume(out);const data=analysis.finish();assert.equal(data.version,'complete-evaluation-dataset-1.5.0');assert.deepEqual(data.images[0].subjectRegions,record);assert.equal(data.assessment,null);assert.match(completePreview(data),/手動の人物範囲/);assert.ok(!JSON.stringify(data).includes('base64'));
 const clear=subjectRegionsRecord(b.group,b.images[0],null,null,'r01','2026-10-13T02:00:00.000Z'),cleared=recordSubjectRegions(next,b.images[0].id,clear),clearedBundle=comparisonBundle(cleared,b.group.id);
 const merged=mergeCompleteImport(cleared,[out]);assert.equal(merged.images[0].subjectRegions.sourcePhoto.rect,null);await analysis.consume(clearedBundle);await analysis.consume(out);assert.equal(analysis.finish().images[0].subjectRegions.sourcePhoto.rect,null);
 const conflict=structuredClone(out);conflict.images[0].subjectRegions.sourcePhoto.rect.x++;assert.throws(()=>mergeCompleteImport(next,[conflict]),/同時刻/);await assert.rejects(()=>analysis.consume({...clearedBundle,images:clearedBundle.images.map((x,i)=>i?x:{...x,subjectRegions:{...clear,reviewerId:'r02'}})}),/同時刻/);
});
function dom(){const all=n=>[n,...n.children.flatMap(all)],document={createElement(tag){return {tag,children:[],attrs:{},events:{},style:{},textContent:'',value:'',disabled:false,open:false,append(...n){this.children.push(...n);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.events[k]=f;},getContext:()=>({clearRect(){},drawImage(){},strokeRect(){}}),getBoundingClientRect:()=>({left:0,top:0,width:640,height:360}),setPointerCapture(){}};}};return {document,root:document.createElement('section'),all};}
test('manual region controls load lazily, save one paired record, retain errors and clear without fetching or generating',async()=>{
 const {b}=await fixture(),d=dom();let loads=0,fail=false,records=[];const dispose=createSubjectRegionControls({...d,group:b.group,image:b.images[0],loadImage:async src=>{loads++;return {naturalWidth:src===b.group.sourceImageDataUrl?1280:1536,naturalHeight:src===b.group.sourceImageDataUrl?720:864};},onSave:async record=>{if(fail)throw new Error('Quota failure');records.push(record);}});
 assert.equal(loads,0);const details=d.all(d.root).find(x=>x.tag==='details');details.open=true;await details.events.toggle();assert.equal(loads,2);
 const canvases=d.all(d.root).filter(x=>x.tag==='canvas');for(const canvas of canvases){await canvas.events.pointerdown({button:0,pointerId:1,clientX:10,clientY:10,preventDefault(){}});canvas.events.pointermove({pointerId:1,clientX:300,clientY:300});canvas.events.pointerup({type:'pointerup',pointerId:1,clientX:300,clientY:300});}
 const save=d.all(d.root).find(x=>x.textContent==='両方の人物範囲を保存');fail=true;await save.events.click();assert.equal(records.length,0);assert.ok(d.all(d.root).some(x=>x.textContent.includes('Quota failure')));fail=false;await save.events.click();assert.equal(records.length,1);assert.equal(records[0].sourcePhoto.rect.x,20);
 const clear=d.all(d.root).find(x=>x.textContent==='人物範囲を解除');await clear.events.click();assert.equal(records.length,2);assert.equal(records[1].completeThumbnail.rect,null);dispose();await save.events.click();assert.equal(records.length,2);
});
test('subject selector module is served locally without changing the diagnostics API or requiring an image key',async()=>{
 const {makeServer}=await import('../backend/server.mjs'),server=makeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url=`http://127.0.0.1:${server.address().port}`,before=await(await fetch(url+'/api/v1/health')).json();assert.equal((await fetch(url+'/subject-regions.js')).status,200);assert.deepEqual((await(await fetch(url+'/api/v1/health')).json()).completeGeneration,before.completeGeneration);}finally{await new Promise(r=>server.close(r));}
 const fixture=JSON.parse(await readFile(new URL('../docs/fixtures/subject-regions.json',import.meta.url),'utf8'));assert.equal(fixture.source,'synthetic');assert.equal(fixture.record.method,'manual');
});
test('paired extent is required and identical while truncation is independent for each image',async()=>{
 const {b,record}=await fixture();assert.equal(record.version,'subject-regions-1.1.0');assert.equal(record.sourcePhoto.extent,'head_shoulders');assert.equal(record.completeThumbnail.truncated,false);
 const cut=subjectRegionsRecord(b.group,b.images[0],sourceRect,{x:0,y:0,width:400,height:400},'r01',time,{extent:'face',completeTruncated:true});assert.equal(cut.sourcePhoto.truncated,false);assert.equal(cut.completeThumbnail.truncated,true);
 for(const change of [{extent:'upper_body'},{extent:'unknown'},{truncated:undefined},{truncated:1}])assert.throws(()=>validateSubjectRegions({...record,completeThumbnail:{...record.completeThumbnail,...change}},b.group,b.images[0]));
 for(const key of ['extent','truncated']){const changed=structuredClone(record);delete changed.sourcePhoto[key];assert.throws(()=>validateSubjectRegions(changed,b.group,b.images[0]));}
 assert.throws(()=>subjectRegionsRecord(b.group,b.images[0],null,null,'r01',time,{completeTruncated:true}));
});
test('legacy rectangles retain unknown extent across export, ZIP and analysis rather than inventing head-and-shoulders annotations',async()=>{
 const {b,state,record}=await fixture(),legacy=structuredClone(record);legacy.version='subject-regions-1.0.0';for(const key of ['sourcePhoto','completeThumbnail']){delete legacy[key].extent;delete legacy[key].truncated;}
 assert.deepEqual(validateSubjectRegions(legacy,b.group,b.images[0]),legacy);const annotated=recordSubjectRegions(state,b.images[0].id,legacy),out=comparisonBundle(annotated,b.group.id);assert.deepEqual((await validateCompleteBundle(out)).images[0].subjectRegions,legacy);
 const zip=await createCompleteShareZip(comparisonReport(annotated)),restored=await comparisonFromZip(new Uint8Array(await zip.blob.arrayBuffer()));assert.deepEqual(restored.sets[0].images[0].subjectRegions,legacy);
 const analysis=createCompleteReviewAnalysis();await analysis.consume(out);const result=analysis.finish();assert.equal(result.images[0].subjectRegions.sourcePhoto.extent,undefined);assert.match(completePreview(result),/旧記録で未確認/);
});
test('numeric reviewer IDs are shared by human comparisons and subject records without silently remapping old alphabetic IDs',async()=>{
 const {b,record}=await fixture(),context=b.review.context;for(const reviewerId of ['rabc','r0','R01','r01_name','r-01','r01\n','someone']){assert.throws(()=>validateReviewContext({...context,reviewerId}));assert.throws(()=>validateSubjectRegions({...record,reviewerId},b.group,b.images[0]));}
 for(const reviewerId of ['r01','r001','r12345']){assert.equal(validateReviewContext({...context,reviewerId}).reviewerId,reviewerId);assert.equal(validateSubjectRegions({...record,reviewerId},b.group,b.images[0]).reviewerId,reviewerId);}
});
test('subject controls preserve chosen extent/truncation and require confirmation when upgrading old rectangles',async()=>{
 const {b,record}=await fixture(),legacy=structuredClone(record);legacy.version='subject-regions-1.0.0';for(const key of ['sourcePhoto','completeThumbnail']){delete legacy[key].extent;delete legacy[key].truncated;}
 const d=dom(),records=[];createSubjectRegionControls({...d,group:b.group,image:{...b.images[0],subjectRegions:legacy},loadImage:async src=>({naturalWidth:src===b.group.sourceImageDataUrl?1280:1536,naturalHeight:src===b.group.sourceImageDataUrl?720:864}),onSave:async r=>records.push(r)});
 const details=d.all(d.root).find(x=>x.tag==='details');details.open=true;await details.events.toggle();const save=d.all(d.root).find(x=>x.textContent==='両方の人物範囲を保存');await save.events.click();assert.equal(records.length,0);assert.ok(d.all(d.root).some(x=>x.textContent.includes('旧記録には部位')));
 d.all(d.root).find(x=>x.tag==='label'&&x.textContent.startsWith('旧記録の範囲')).children[0].checked=true;d.all(d.root).find(x=>x.attrs['aria-label']==='人物範囲の部位').value='upper_body';d.all(d.root).find(x=>x.attrs['aria-label']==='completeThumbnail truncated').checked=true;await save.events.click();assert.equal(records.length,1);assert.equal(records[0].sourcePhoto.extent,'upper_body');assert.equal(records[0].completeThumbnail.extent,'upper_body');assert.equal(records[0].completeThumbnail.truncated,true);
});
