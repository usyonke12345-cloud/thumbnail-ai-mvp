import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {createEntry,addToGallery,comparisonBundle,comparisonReport} from '../frontend/complete-gallery-model.js';
import {validateCompleteBundle,diagnosticRequest,createCompleteShareZip} from '../frontend/complete-png-transfer.js';
import {readZip,writeZip,decodeText,readComparisonFile,utf8} from '../frontend/local-archive.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {analyzePngAssets} from '../backend/analysis/complete-png.mjs';
import {decodePng} from '../backend/scoring/png.mjs';
import {prepareFeedbackTrials} from '../backend/analysis/feedback-trials.mjs';
import {createDraftBackup,readDraftBackup} from '../frontend/editor-backup.js';
import {validateDraft} from '../frontend/editor-draft.js';
import {freezeValidationA,checkValidationARequest} from '../backend/validation-a.mjs';
import {assertValidationAInput,assertValidationAReceiptInput,validationAZip} from '../frontend/validation-a.js';
import {makeServer} from '../backend/server.mjs';
import {validateComplete} from '../backend/generation/complete.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';

const photos=[20,80,140].map(c=>png(1280,720,[c,c+10,c+20,255])),urls=photos.map(dataUrl);
const sha=b=>createHash('sha256').update(b).digest('hex');
const payload=()=>({title:'人工データ：料理と旅',brief:'',headlineMode:'auto',headline:null,design:'auto',composition:'auto',imageDataUrl:urls[0],additionalImageDataUrls:urls.slice(1)});
const result=(c=40)=>({imageDataUrl:dataUrl(png(1536,864,[c,c+10,c+20,255])),generation_version:'ai-complete-0.11.0',sourcePhotoSha256s:photos.map(sha)});
async function gallery(){let state={groups:[],images:[],reviews:[]};for(let i=0;i<2;i++)state=addToGallery(state,await createEntry(payload(),result(40+i*60),{id:'synthetic-'+i,capturedAt:'2026-10-30T00:00:00.000Z'}));return state;}
const draft=()=>({version:1,layout:'single',settings:[{zoom:1.2,x:.3,y:.7},{zoom:1,x:.5,y:.5}],files:[new File([photos[0]],'main.png',{type:'image/png'}),null],title:'人工データ',headlineMode:'auto',additionalPhotos:urls.slice(1).map((imageDataUrl,i)=>({file:new File(['original-'+i],'original-'+i+'.jpg',{type:'image/jpeg'}),imageDataUrl})),result:result(),consent:true,apiKey:'never-retain'});

test('ordered source hashes define group identity and imported JSON rejects missing, reordered or changed sources',async()=>{
 const state=await gallery(),group=state.groups[0],bundle=comparisonBundle(state,group.id);
 assert.equal(bundle.version,'complete-comparison-1.11.0');assert.deepEqual(group.additionalImageDataUrls,urls.slice(1));
 assert.deepEqual(group.input.additionalSourceSha256s,photos.slice(1).map(sha));assert.deepEqual(await validateCompleteBundle(bundle),bundle);
 const reversed=payload();reversed.additionalImageDataUrls.reverse();const reversedResult=result();reversedResult.sourcePhotoSha256s=[sha(photos[0]),sha(photos[2]),sha(photos[1])];
 assert.notEqual((await createEntry(reversed,reversedResult)).group.id,group.id);
 for(const change of [b=>delete b.group.additionalImageDataUrls,b=>b.group.additionalImageDataUrls.reverse(),b=>b.group.additionalImageDataUrls[0]=dataUrl(png(1280,720,[1,2,3,255])),b=>b.version='complete-comparison-1.10.0',b=>delete b.images[0].result.sourcePhotoSha256s]){const bad=structuredClone(bundle);change(bad);await assert.rejects(()=>validateCompleteBundle(bad));}
 await assert.rejects(()=>createEntry(payload(),{...result(),sourcePhotoSha256s:photos.map(sha).reverse()}),/SHA-256/);
 const {additionalImageDataUrls,...single}=payload(),{sourcePhotoSha256s,...singleResult}=result();
 assert.equal((await createEntry(single,singleResult)).group.id,(await createEntry({...single,additionalImageDataUrls:[]},singleResult)).group.id);
});

test('shared ZIP deduplicates all three source assets and restores the exact records in the browser',async()=>{
 const state=await gallery(),report=comparisonReport(state),zip=await createCompleteShareZip(report),files=await readZip(new Uint8Array(await zip.blob.arrayBuffer()));
 assert.equal(zip.assets,5);assert.equal(zip.images,2);assert.equal([...files.keys()].filter(x=>x.startsWith('assets/')).length,5);
 const compact=decodeText(files.get('report-with-asset-references.json'));assert.ok(!compact.includes('data:image/'));
 const restored=await readComparisonFile(new File([zip.blob],'share.zip',{type:'application/zip'}));
 assert.deepEqual(restored,report);assert.match(decodeText(files.get('preview.html')),/追加の写真2/);
});

test('diagnostics bind every source, batch within four assets and decode each unique PNG once without retaining pixels',async()=>{
 const state=await gallery(),bundle=comparisonBundle(state,state.groups[0].id);
 await assert.rejects(()=>diagnosticRequest(bundle),/合わせて4枚/);
 const request=await diagnosticRequest(bundle,[state.images[0].id]);assert.equal(request.assetVersion,'image-assets-1.1.0');assert.equal(request.assets.length,4);
 const response=analyzePngAssets(request);assert.equal(response.analysisVersion,'complete-png-diagnostics-0.1.2');assert.equal(response.assessment,null);assert.equal(response.images[0].qualityScore,null);assert.equal(response.images[0].additionalSourcePhotoAssetIds.length,2);
 for(const mutate of [r=>r.assetVersion='image-assets-1.0.0',r=>r.images[0].additionalSourcePhotoAssetIds=[r.images[0].sourcePhotoAssetId],r=>r.images[0].additionalSourcePhotoAssetIds=['missing'],r=>delete r.images[0].additionalSourcePhotoAssetIds]){const bad=structuredClone(request);mutate(bad);assert.throws(()=>analyzePngAssets(bad),e=>e.code==='INVALID_DIAGNOSTIC_INPUT');}
 let decodes=0;const stored=new Map(),analysis=createCompleteReviewAnalysis({decode:bytes=>{decodes++;return decodePng(bytes);},onAsset:async(asset,bytes)=>stored.set(asset.path,bytes)});await analysis.consume(bundle);await analysis.consume(bundle);
 const dataset=analysis.finish();assert.equal(decodes,5);assert.equal(stored.size,5);assert.equal(dataset.version,'complete-evaluation-dataset-1.10.0');assert.equal(dataset.groups[0].additionalSourcePhotoAssetIds.length,2);
 assert.ok(!JSON.stringify(dataset).includes('data:image/'));assert.ok(!JSON.stringify(dataset).includes('rgba'));const html=completePreview(dataset);assert.match(html,/追加写真 1/);assert.match(html,/追加写真 2/);
 assert.equal(prepareFeedbackTrials(dataset,'r01',{generationVersion:'ai-complete-0.11.0'}).pairs.length,0);
});

test('an unreadable additional source prevents a human comparison from being counted as complete',async()=>{
 const state=await gallery(),bundle=comparisonBundle(state,state.groups[0].id);
 bundle.review={version:1,groupId:bundle.group.id,recordedAt:'2026-10-30T01:00:00.000Z',decision:'none_acceptable',imageId:null,reason:'Synthetic fixture only',issues:[],displayWidths:bundle.images.map(x=>({imageId:x.id,width:240})),context:{version:1,reviewerId:'r01',titleSource:'synthetic',titlePermissionConfirmed:false,photoPermissionConfirmed:false}};
 const analysis=createCompleteReviewAnalysis({decode:bytes=>{if(sha(bytes)===sha(photos[2]))throw Error('synthetic decode failure');return decodePng(bytes);}});await analysis.consume(bundle);const dataset=analysis.finish();
 assert.equal(dataset.progress.completedHumanComparisons,0);assert.equal(dataset.progress.pending[0].reason,'unavailable_image');
});

test('draft ZIP retains original files, normalized inputs, crop and source provenance without consent or credentials',async()=>{
 const value=draft(),zip=await createDraftBackup(value),bytes=new Uint8Array(await zip.arrayBuffer()),restored=await readDraftBackup(bytes);
 assert.equal(restored.consent,undefined);assert.equal(restored.apiKey,undefined);assert.deepEqual(restored.settings,value.settings);assert.deepEqual(restored.result.sourcePhotoSha256s,photos.map(sha));
 for(let i=0;i<2;i++){assert.equal(restored.additionalPhotos[i].imageDataUrl,urls[i+1]);assert.equal(restored.additionalPhotos[i].file.name,value.additionalPhotos[i].file.name);assert.equal(await restored.additionalPhotos[i].file.text(),'original-'+i);}
 // Node 22 clones File as Blob. Compare persisted bytes, MIME and input identity,
 // independently of the runtime's File wrapper; ZIP filenames are checked above.
 const reloaded=validateDraft(structuredClone(restored));assert.equal(reloaded.additionalPhotos.length,2);
 for(let i=0;i<2;i++){assert.equal(reloaded.additionalPhotos[i].imageDataUrl,restored.additionalPhotos[i].imageDataUrl);assert.equal(reloaded.additionalPhotos[i].file.type,restored.additionalPhotos[i].file.type);assert.deepEqual(await reloaded.additionalPhotos[i].file.arrayBuffer(),await restored.additionalPhotos[i].file.arrayBuffer());}
 const files=await readZip(bytes),key=[...files.keys()].find(x=>x.startsWith('additional-input-'));files.set(key,utf8('changed'));
 const broken=await writeZip([...files].map(([name,data])=>({name,data})));await assert.rejects(async()=>readDraftBackup(new Uint8Array(await broken.arrayBuffer())),/破損/);
});

test('multi-photo A snapshot and receipt bind source order and ZIP carries every exact PNG as a separate reference case',async()=>{
 const input=payload(),fixed=await freezeValidationA(input);assert.equal(fixed.version,'validation-a-case-1.1.0');assert.equal(fixed.service.generationVersion,'ai-complete-0.11.0');assert.deepEqual(fixed.additionalSources.map(x=>x.sha256),photos.slice(1).map(sha));
 await assertValidationAInput(fixed,input);const receipt=await checkValidationARequest({...input,consent:true},fixed.caseId);await assertValidationAReceiptInput(receipt,input);
 for(const changed of [{...input,additionalImageDataUrls:[...input.additionalImageDataUrls].reverse()},{...input,additionalImageDataUrls:[]},{...input,additionalImageDataUrls:[urls[1]]}]){await assert.rejects(()=>assertValidationAInput(fixed,changed));await assert.rejects(()=>checkValidationARequest({...changed,consent:true},fixed.caseId),e=>e.code==='VALIDATION_A_MISMATCH');}
 const zip=await validationAZip(fixed,urls[0],urls.slice(1)),files=await readZip(new Uint8Array(await zip.arrayBuffer()));for(let i=0;i<3;i++)assert.deepEqual(Buffer.from(files.get(i?'source-'+(i+1)+'.png':'source.png')),photos[i]);
 const protocol=JSON.parse(decodeText(files.get('comparison-protocol.json')));assert.equal(protocol.comparison,'reference_multi_photo');assert.equal(protocol.pr11SinglePhotoCompatible,false);assert.equal(protocol.sourcePhotoCount,3);
 assert.match(fixed.chatgptPrompt,/これら3枚/);assert.doesNotMatch(fixed.chatgptPrompt,/cutout|source.only|never merge/);
 const withReceipt={...result(),validationA:receipt},entry=await createEntry(input,withReceipt,{expectedValidationACase:fixed.caseId});assert.deepEqual(entry.image.result.validationA,receipt);
 const value={...draft(),validationA:fixed,result:withReceipt},restored=await readDraftBackup(new Uint8Array(await(await createDraftBackup(value)).arrayBuffer()));assert.deepEqual(restored.validationA.additionalSources,fixed.additionalSources);assert.deepEqual(restored.result.validationA,receipt);
});

test('revision preparation restores every normalized input photo before applying the next draft',async()=>{
 const state=await gallery(),source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function prepareRevision('),source.indexOf("document.querySelector('#cancel-revision')"));let applied;
 const nodes={'#clear-draft':{disabled:false},'#editor-workspace':{disabled:false},'#revision-tools':{scrollIntoView(){}}};const scope={File,Blob,fromDataUrl:u=>Buffer.from(u.slice(22),'base64'),captureCurrentDraft:draft,document:{querySelector:id=>nodes[id]},completedResult:null,applyImportedDraft:async d=>applied=d};
 runInNewContext(code+';globalThis.prepare=prepareRevision;',scope);await scope.prepare({group:state.groups[0],image:state.images[0],instruction:'少し穏やかに'});
 assert.deepEqual(Array.from(applied.additionalPhotos,x=>x.imageDataUrl),urls.slice(1));assert.equal(applied.revision.sourceImageDataUrl,urls[0]);assert.equal(applied.revision.parentImageId,state.images[0].id);assert.equal(nodes['#editor-workspace'].disabled,false);
});

test('HTTP freeze checks all three photos before a mock edit, and serves the browser modules',async()=>{
 let calls=0;const server=makeServer({complete:async v=>{validateComplete(v);calls++;return result();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  const fixedResponse=await post('/api/v1/validation-a/freeze',payload());assert.equal(fixedResponse.status,200);const fixed=await fixedResponse.json();assert.equal(calls,0);
  const headers={'X-Validation-A-Case':fixed.caseId},bad=await post('/api/v1/complete-thumbnail',{...payload(),additionalImageDataUrls:[urls[1]],consent:true},headers);assert.equal(bad.status,409);assert.equal(calls,0);
  const good=await post('/api/v1/complete-thumbnail',{...payload(),consent:true},headers);assert.equal(good.status,200);assert.deepEqual((await good.json()).validationA.additionalSourceSha256s,photos.slice(1).map(sha));assert.equal(calls,1);
  for(const path of ['/multi-photo.js','/shared/multi-photo.mjs'])assert.equal((await fetch(base+path)).status,200);
 }finally{await new Promise(r=>server.close(r));}
});

test('the editor snapshots added sources and text before an asynchronous main-file read',async()=>{
 const source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function captureAIInput()'),source.indexOf('function updateCompletedResultStatus('));let resolveFile;const promise=new Promise(r=>resolveFile=r);
 const nodes={'#ai-title':{value:'人工データ'},'#ai-brief':{value:''},'#ai-headline-mode':{value:'auto'},'#ai-design':{value:'auto'},'#ai-visual-intent':{value:''},'#ai-composition':{value:'auto'}},extra=[{imageDataUrl:urls[1]},{imageDataUrl:urls[2]}];
 const scope={activeRevision:null,layout:{value:'single'},photos:[{naturalWidth:1280,naturalHeight:720}],settings:[{zoom:1,x:.5,y:.5}],storedFiles:[{type:'image/png',size:photos[0].length,arrayBuffer:()=>promise}],multiPhotos:{capture:()=>extra},document:{querySelector:id=>nodes[id],createElement:()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>urls[0]})},cropPlacement:()=>({x:0,y:0,width:1280,height:720}),headline:{value:''},toDataUrl:b=>dataUrl(Buffer.from(b))};
 runInNewContext(code+';globalThis.capture=captureAIInput;',scope);const pending=scope.capture();nodes['#ai-title'].value='changed';extra.reverse();resolveFile(photos[0]);const captured=await pending;
 assert.equal(captured.title,'人工データ');assert.deepEqual(Array.from(captured.additionalImageDataUrls),urls.slice(1));assert.equal(captured.imageDataUrl,urls[0]);
});
