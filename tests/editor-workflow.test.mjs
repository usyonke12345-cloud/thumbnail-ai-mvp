import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {createCompleteShareZip,validateCompleteImport} from '../frontend/complete-png-transfer.js';
import {comparisonFromZip,readZip,writeZip,utf8,crc32,readComparisonFile} from '../frontend/local-archive.js';
import {createDraftBackup,readDraftBackup} from '../frontend/editor-backup.js';
import {validateDraft} from '../frontend/editor-draft.js';
import {captureVideoFrame,createEditorTools} from '../frontend/editor-tools.js';
import {encodeImage,exportOptions} from '../frontend/image-save.js';
import {validateAttempt,summarizeAttempts,createAttemptHistory} from '../frontend/attempt-history.js';
import {createEntry,addToGallery,comparisonReport,comparisonBundle,galleryCapacity,checkGenerationCapacity} from '../frontend/complete-gallery-model.js';
import {packGallery,unpackGallery} from '../frontend/complete-gallery-store.js';
import {validateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {bundle,png,dataUrl} from './helpers/complete-png.mjs';
const empty=()=>({groups:[],images:[],reviews:[]});
async function report(){const b=await bundle();return comparisonReport({groups:[b.group],images:b.images,reviews:[b.review]});}
function deflatedArchive(files){
 const local=[],central=[];let offset=0;
 for(const [name,content]of files){const plain=Buffer.from(content),data=deflateRawSync(plain),filename=Buffer.from(name),header=Buffer.alloc(30+filename.length);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(8,8);header.writeUInt32LE(crc32(plain),14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(plain.length,22);header.writeUInt16LE(filename.length,26);filename.copy(header,30);local.push(header,data);const c=Buffer.alloc(46+filename.length);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc32(plain),16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(plain.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);filename.copy(c,46);central.push(c);offset+=header.length+data.length;}
 const end=Buffer.alloc(22),directory=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.size,8);end.writeUInt16LE(files.size,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
test('shared ZIP imports directly in memory for STORE, wrapped Windows DEFLATE and JSON without any requests',async()=>{
 const original=await report(),shared=await createCompleteShareZip(original),bytes=new Uint8Array(await shared.blob.arrayBuffer());
 assert.deepEqual(await comparisonFromZip(bytes),original);assert.equal((await validateCompleteImport(await readComparisonFile(shared.blob)))[0].images.length,2);
 assert.deepEqual(await readComparisonFile(new Blob([JSON.stringify(original)])),original);
 const files=await readZip(bytes),wrapped=new Map([...files].map(([name,data])=>['private-export/'+name,data]));assert.deepEqual(await comparisonFromZip(deflatedArchive(wrapped)),original);
});
test('ZIP import rejects corrupted payloads, checksum tampering, duplicate paths, traversal and expansion overflow',async()=>{
 const shared=await createCompleteShareZip(await report()),bytes=new Uint8Array(await shared.blob.arrayBuffer()),files=await readZip(bytes);
 const corrupted=bytes.slice();corrupted[90]^=1;await assert.rejects(()=>readZip(corrupted));
 const changed=new Map(files);changed.set('report-with-asset-references.json',utf8('{}'));await assert.rejects(async()=>comparisonFromZip(new Uint8Array(await (await writeZip([...changed].map(([name,data])=>({name,data})))).arrayBuffer())),/SHA-256/);
 for(const name of ['../outside','/absolute','a\\b','a/../b'])await assert.rejects(()=>readZip(deflatedArchive(new Map([[name,utf8('x')]]))),/パス/);
 const bomb=deflatedArchive(new Map([['huge',new Uint8Array(100)]]));const end=bomb.length-22,central=bomb.readUInt32LE(end+16);bomb.writeUInt32LE(193*1024*1024,central+24);await assert.rejects(()=>readZip(bomb),/容量/);
 await assert.rejects(()=>writeZip([{name:'same',data:utf8('x')},{name:'same',data:utf8('y')}]),/ファイル名/);
});
function draftFixture(){return {version:1,layout:'single',settings:[{zoom:1.4,x:.25,y:.75},{zoom:1,x:.5,y:.5}],files:[new Blob([png(1280,720)],{type:'image/png'}),null],title:'Artificial video',headline:'SYNTHETIC',headlineMode:'manual',brief:'Artificial notes',visualIntent:'落ち着いた雰囲気',projectName:'synthetic-project',composition:'text_left',design:'editorial',accent:'#abcdef',position:'right',protect:'center',shade:32,result:{imageDataUrl:dataUrl(png()),generation_version:COMPLETE_GENERATION_VERSION,limitations:['Synthetic only']},revision:{instruction:'文字を穏やかに',parentImageId:'parent-1',imageDataUrl:dataUrl(png()),sourceImageDataUrl:dataUrl(png(1280,720))},apiKey:'must-not-export',consent:true};}
test('draft ZIP restores original photo bytes, crop settings, inputs, result and revision without credentials or consent',async()=>{
 const before=draftFixture(),zip=await createDraftBackup(before),bytes=new Uint8Array(await zip.arrayBuffer()),files=await readZip(bytes),restored=await readDraftBackup(bytes);
 assert.deepEqual(Buffer.from(await restored.files[0].arrayBuffer()),png(1280,720));assert.deepEqual(restored.settings,before.settings);assert.equal(restored.title,before.title);assert.equal(restored.projectName,before.projectName);assert.equal(restored.revision.instruction,before.revision.instruction);assert.equal(restored.revision.sourceImageDataUrl,before.revision.sourceImageDataUrl);assert.equal(restored.result.imageDataUrl,before.result.imageDataUrl);assert.equal(restored.consent,undefined);assert.equal(restored.apiKey,undefined);
 assert.ok(!new TextDecoder().decode(files.get('editor-backup.json')).includes('must-not-export'));
 const wrong=new Map(files);wrong.set([...files.keys()].find(x=>x.startsWith('original-')),utf8('broken photo'));const broken=await writeZip([...wrong].map(([name,data])=>({name,data})));await assert.rejects(async()=>readDraftBackup(new Uint8Array(await broken.arrayBuffer())),/破損/);
 assert.equal(validateDraft({...before,revision:null}).revision,null);assert.throws(()=>validateDraft({...before,revision:{...before.revision,instruction:''}}));
});
test('gallery holds more than six images, deduplicates storage assets and retains independent limits for groups and projects',async()=>{
 let state=empty();for(let i=0;i<14;i++){state=addToGallery(state,await createEntry({title:`video-${Math.floor(i/7)}`,brief:'',headlineMode:'auto',imageDataUrl:dataUrl(png(1280,720))},{imageDataUrl:dataUrl(png(1536,864,[i,20,60,255]))},{id:'image-'+i,projectName:'test-project'}));}
 assert.equal(state.images.length,14);const packed=packGallery(state);assert.equal(packed.assets.length,15);assert.ok(packed.images.every(x=>!x.result.imageDataUrl));assert.ok(packed.groups.every(x=>!x.sourceImageDataUrl));assert.deepEqual(unpackGallery(packed),{groups:state.groups,images:state.images,reviews:state.reviews});assert.equal(galleryCapacity(state).uniqueAssets,15);
 const b=comparisonBundle(state,state.groups[0].id);assert.equal(b.version,'complete-comparison-1.6.0');assert.equal((await validateCompleteImport(b))[0].group.projectName,'test-project');
 const tooMany={...state,images:[...state.images,...Array.from({length:6},(_,i)=>({...state.images[0],id:'overflow-'+i,imageSha256:String(i).padStart(64,'0')}))]};const next=await createEntry({title:'third-video',brief:'',headlineMode:'auto',imageDataUrl:dataUrl(png(1280,720))},{imageDataUrl:dataUrl(png())},{id:'next',projectName:'test-project'});assert.throws(()=>addToGallery(tooMany,next),/1組/);
 const broken=structuredClone(packed);broken.assets.pop();assert.throws(()=>unpackGallery(broken),/見つけられません/);
});
test('revision validates two images, makes one mocked paid edit and preserves parent references through export and analysis',async()=>{
 const parent=await bundle({count:1,review:false}),{sourceSha256,...context}=parent.group.input,input={...context,headline:null,headlineMode:'auto',imageDataUrl:parent.group.sourceImageDataUrl,consent:true,revision:{instruction:'文字を穏やかに',parentImageId:parent.images[0].id,imageDataUrl:parent.images[0].result.imageDataUrl}};
 const validated=validateComplete(input);let calls=0;
 const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'fake-test-only',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{calls++;assert.match(url,/images\/edits$/);assert.equal(body.get('n'),'1');assert.equal(body.get('model'),'gpt-image-2.5-flare');const images=body.getAll('image[]');assert.equal(images.length,2);assert.deepEqual(Buffer.from(await images[0].arrayBuffer()),Buffer.from(input.imageDataUrl.slice(22),'base64'));assert.deepEqual(Buffer.from(await images[1].arrayBuffer()),Buffer.from(input.revision.imageDataUrl.slice(22),'base64'));assert.match(body.get('prompt'),/image 1 is the original photograph/);assert.ok(body.get('prompt').includes(input.revision.instruction));return new Response(JSON.stringify({data:[{b64_json:png(1536,864,[8,9,10,255]).toString('base64')}]}));}});
 const result=await provider(validated);await assert.rejects(()=>provider(validated),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
 const entry=await createEntry(input,{imageDataUrl:result,generation_version:COMPLETE_GENERATION_VERSION},{id:'revised-1'}),state=addToGallery(empty(),entry),b=comparisonBundle(state,entry.group.id);assert.equal(b.version,'complete-comparison-1.6.0');assert.equal(b.images[0].revision.parentImageId,input.revision.parentImageId);assert.ok(!JSON.stringify(b.images[0].revision).includes('base64'));
 const imported=(await validateCompleteImport(b))[0];assert.deepEqual(imported.images[0].revision,b.images[0].revision);const analysis=createCompleteReviewAnalysis();await analysis.consume(imported);assert.equal(analysis.finish().version,'complete-evaluation-dataset-1.4.0');
 for(const revision of [null,{...input.revision,instruction:''},{...input.revision,instruction:'x'.repeat(301)},{...input.revision,imageDataUrl:dataUrl(png(1280,720))},{...input.revision,parentImageId:''},{...input.revision,extra:true}])assert.throws(()=>validateComplete({...input,revision}));
 await assert.rejects(()=>validateCompleteImport({...b,version:'complete-comparison-1.5.0'}),/1.6.0/);
});
test('known group and project limits reject generation before sending, and extended reports retain their version',async()=>{
 let state=empty();const source=dataUrl(png(1280,720));
 for(let i=0;i<24;i++)state=addToGallery(state,await createEntry({title:'limit-'+Math.floor(i/12),brief:'',headlineMode:'auto',imageDataUrl:source},{imageDataUrl:dataUrl(png(1536,864,[i,90,100,255]))},{id:'limit-image-'+i,projectName:'shared-project'}));
 await assert.rejects(()=>checkGenerationCapacity(state,{title:'limit-0',brief:'',headlineMode:'auto',imageDataUrl:source},'shared-project'),/12枚/);
 await assert.rejects(()=>checkGenerationCapacity(state,{title:'another',brief:'',headlineMode:'auto',imageDataUrl:source},'shared-project'),/24枚/);
 await checkGenerationCapacity(state,{title:'another',brief:'',headlineMode:'auto',imageDataUrl:source},'another-project');
 const exported=comparisonReport(state);assert.equal(exported.version,'complete-comparison-report-1.1.0');assert.equal((await validateCompleteImport(exported)).length,2);
 const draft=draftFixture(),snapshot=validateDraft(draft);draft.files[0]=null;draft.settings[0].x=1;assert.ok(snapshot.files[0]);assert.equal(snapshot.settings[0].x,.25);
});
test('an explicit new project label moves the whole comparison group without duplicating PNGs or changing input identity',async()=>{
 const payload={title:'same-video',brief:'',headlineMode:'auto',imageDataUrl:dataUrl(png(1280,720))},result={imageDataUrl:dataUrl(png())};
 const first=await createEntry(payload,result,{id:'first',projectName:'before'}),state=addToGallery(empty(),first),second=await createEntry(payload,result,{id:'duplicate',projectName:'after'}),next=addToGallery(state,second);
 assert.equal(next.added,false);assert.equal(next.images.length,1);assert.equal(next.groups[0].projectName,'after');assert.equal(next.groups[0].id,first.group.id);assert.equal(state.groups[0].projectName,'before');
});
test('image export adjusts size and JPEG quality to a target without modifying the original completed PNG',async()=>{
 let canvas;const original=dataUrl(png()),qualities=[];
 const document={createElement(){return canvas={getContext:()=>({fillRect(){},drawImage(){}}),toBlob(callback,mime,quality){qualities.push(quality);callback(new Blob([new Uint8Array(mime==='image/jpeg'?Math.round(quality*4096):8000)],{type:mime}));}};}};
 const saved=await encodeImage(original,{width:1280,format:'jpeg',quality:.9,maxBytes:2100},{document,load:async()=>({})});assert.equal(canvas.width,1280);assert.equal(canvas.height,720);assert.equal(saved.blob.type,'image/jpeg');assert.ok(saved.blob.size<=2100);assert.ok(qualities.length>1);assert.equal(original,dataUrl(png()));
 await assert.rejects(()=>encodeImage(original,{format:'png',maxBytes:1},{document,load:async()=>({})}),/容量/);for(const options of [{width:100},{format:'gif'},{quality:0},{maxBytes:-1}])assert.throws(()=>exportOptions(options));
});
test('video frames keep aspect ratio and timestamp, reject unavailable/seeking frames, and do not generate',async()=>{
 let canvas,draws=0;const document={createElement(){return canvas={getContext:()=>({drawImage(){draws++;}}),toBlob(callback,mime){callback(new Blob(['synthetic frame'],{type:mime}));}};}};
 const video={videoWidth:3840,videoHeight:2160,currentTime:12.5,readyState:2,seeking:false};const photo=await captureVideoFrame(video,{document});assert.equal(photo.type,'image/png');assert.equal(canvas.width/canvas.height,16/9);assert.equal(draws,1);if(photo.name)assert.ok(photo.name.includes('12.5'));
 for(const bad of [{...video,seeking:true},{...video,readyState:1},{...video,videoWidth:0},{...video,videoHeight:50000}])await assert.rejects(()=>captureVideoFrame(bad,{document}));
});
function dom(){const all=n=>[n,...n.children.flatMap(all)],document={createElement(tag){return {tag,children:[],style:{},attrs:{},events:{},value:'',disabled:false,textContent:'',append(...n){this.children.push(...n);},prepend(...n){this.children.unshift(...n);},replaceChildren(...n){this.children=n;},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.events[k]=f;}};}};const root=document.createElement('section');return {root,document,find:p=>all(root).find(p)};}
test('attempt history persists success, API/timeout/network and save errors, keeping costs and interrupted results unknown',async()=>{
 const fixture=dom(),stored=new Map(),downloads=[],storage={load:async()=>[],put:async r=>stored.set(r.id,structuredClone(r))},history=createAttemptHistory({...fixture,storage,download:(...args)=>downloads.push(args)});await history.ready;
 for(const status of ['success','api_error','network_error','timeout','save_error']){const id=await history.start({title:'synthetic',projectName:'tests'});await history.finish(id,{status,elapsedMs:1200,error:status==='success'?null:'artificial failure'});}
 await history.start({title:'unconfirmed'});const summary=summarizeAttempts([...stored.values()]);assert.equal(summary.finished,5);assert.equal(summary.imagesReturned,2);assert.equal(summary.imageReturnRate,.4);assert.equal(summary.counts.pending,1);assert.ok([...stored.values()].every(x=>x.costUsd===null));
 fixture.find(x=>x.textContent==='試行履歴をJSONで保存').events.click();const saved=JSON.parse(downloads[0][1]);assert.equal(saved.records.length,6);assert.equal(saved.summary.costUsd,null);
 const r=[...stored.values()][0];assert.throws(()=>validateAttempt({...r,costUsd:0}));assert.throws(()=>validateAttempt({...r,imageReturned:false}));assert.throws(()=>validateAttempt({...r,finishedAt:'1999-01-01'}));
});
test('draft import locks the workspace and does not mutate it if checksum/restore fails; exporting does not generate',async()=>{
 const fixture=dom(),before=draftFixture(),locks=[],downloads=[];let imported=0,fail=false;
 const tools=createEditorTools({...fixture,captureDraft:async()=>before,download:(...args)=>downloads.push(args),restoreDraft:async d=>{if(fail)throw new Error('quota');assert.equal(d.title,before.title);imported++;},onPhoto:async()=>{throw new Error('not a video test');},setLocked:v=>locks.push(v)});
 await tools.save.events.click();assert.equal(downloads.length,1);tools.file.files=[downloads[0][1]];await tools.file.events.change();assert.equal(imported,1);assert.deepEqual(locks,[true,false]);
 fail=true;tools.file.files=[downloads[0][1]];await tools.file.events.change();assert.equal(imported,1);assert.equal(tools.file.disabled,false);assert.deepEqual(locks,[true,false,true,false]);
});
