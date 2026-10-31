import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {validateComplete,generateComplete} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {createEntry,addToGallery,comparisonBundle,comparisonReport,galleryCapacity} from '../frontend/complete-gallery-model.js';
import {validateCompleteBundle,diagnosticRequest,createCompleteShareZip} from '../frontend/complete-png-transfer.js';
import {readZip,writeZip,decodeText,utf8,readComparisonFile} from '../frontend/local-archive.js';
import {createDraftBackup,readDraftBackup} from '../frontend/editor-backup.js';
import {freezeValidationA} from '../backend/validation-a.mjs';
import {validationACase,assertValidationAInput,validationAZip} from '../frontend/validation-a.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {analyzePngAssets} from '../backend/analysis/complete-png.mjs';
import {decodePng} from '../backend/scoring/png.mjs';
import {makeServer} from '../backend/server.mjs';
import {png,chunk,dataUrl} from './helpers/complete-png.mjs';

const f=JSON.parse(await readFile(new URL('../docs/fixtures/four-photos.json',import.meta.url),'utf8')),input=()=>({...structuredClone(f.input),consent:true}),sources=[f.input.imageDataUrl,...f.input.additionalImageDataUrls],sha=b=>createHash('sha256').update(b).digest('hex');
const hashes=sources.map(x=>sha(Buffer.from(x.slice(22),'base64'))),result=(c=40)=>({imageDataUrl:dataUrl(png(1536,864,[c,c+10,c+20,255])),generation_version:f.generationVersion,sourcePhotoSha256s:hashes});
async function gallery(){let state={groups:[],images:[],reviews:[]};for(let i=0;i<2;i++)state=addToGallery(state,await createEntry(input(),result(40+i*60),{id:'four-synthetic-'+i}));return state;}
const draft=()=>({version:1,layout:'single',settings:[{zoom:1.2,x:.3,y:.7},{zoom:1,x:.5,y:.5}],files:[new File([Buffer.from(sources[0].slice(22),'base64')],'main.png',{type:'image/png'}),null],title:f.input.title,visualIntent:f.input.visualIntent,referenceMode:'off',additionalPhotos:sources.slice(1).map((imageDataUrl,i)=>({file:new File(['raw-'+i],'additional-'+i+'.jpg',{type:'image/jpeg'}),imageDataUrl})),result:result(),consent:true});

test('four separate sources precede revision and five style references in one mocked edit, with correct image numbers',async()=>{
 let calls=0;const reference=png(2,2),provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{calls++;const photos=body.getAll('image[]');assert.equal(photos.length,10);for(let i=0;i<4;i++){assert.equal(photos[i].name,i?'source-'+(i+1)+'.png':'source.png');assert.equal(sha(Buffer.from(await photos[i].arrayBuffer())),hashes[i]);}assert.equal(photos[4].name,'previous.png');assert.equal(photos[5].name,'reference-1.png');assert.match(body.get('prompt'),/Images 1 through 4 are the only photographic material/);assert.match(body.get('prompt'),/image 5 is the previous completed thumbnail/);assert.match(body.get('prompt'),/Reference image 6 illustrates candidate 1/);assert.match(body.get('prompt'),/Reference image 10 illustrates candidate 5/);assert.equal(body.get('n'),'1');assert.equal(body.get('quality'),'medium');assert.equal(body.get('model'),'gpt-image-2.5-flare');return new Response(JSON.stringify({data:[{b64_json:png().toString('base64')}]}));}});
 const v=validateComplete({...input(),revision:{parentImageId:'synthetic-parent',instruction:'文字を少し小さく',imageDataUrl:dataUrl(png())}});v._references={context:{version:'thumbnail-reference-context-1.0.0',librarySha256:'a'.repeat(64)},rows:Array.from({length:5},(_,i)=>({videoId:'t'+String(i).padStart(10,'0'),observation:{material:'scene',typography:'Synthetic',layout:'Synthetic '+i}})),assets:Array.from({length:5},(_,i)=>({videoId:'t'+String(i).padStart(10,'0'),bytes:reference,mimeType:'image/png',extension:'png'}))};await provider(v);assert.equal(calls,1);await assert.rejects(()=>provider(v),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
 const response=await generateComplete(input(),{generate:async()=>dataUrl(png())});assert.equal(response.generation_version,'ai-complete-0.13.0');assert.deepEqual(response.sourcePhotoSha256s,hashes);
 let generated=0;await assert.rejects(()=>generateComplete({...input(),additionalImageDataUrls:[...f.input.additionalImageDataUrls,dataUrl(png(1280,720,[1,2,3,255]))]},{generate:async()=>{generated++;}}),e=>e.code==='INVALID_IMAGE');assert.equal(generated,0);
});

test('four-photo JSON and shared ZIP preserve ordered sources and reject old versions, dropped sources and changed hashes',async()=>{
 const state=await gallery(),bundle=comparisonBundle(state,state.groups[0].id);assert.equal(bundle.version,f.expected.comparisonVersion);assert.deepEqual(await validateCompleteBundle(bundle),bundle);assert.equal(galleryCapacity(state).uniqueAssets,6);
 const report=comparisonReport(state);assert.equal(report.version,'complete-comparison-report-1.1.0');const zip=await createCompleteShareZip(report);assert.equal(zip.assets,6);assert.deepEqual(await readComparisonFile(new File([zip.blob],'share.zip')),report);
 for(const mutate of [v=>v.version='complete-comparison-1.11.0',v=>v.group.additionalImageDataUrls.pop(),v=>v.group.additionalImageDataUrls.reverse(),v=>v.images[0].result.sourcePhotoSha256s.pop()]){const bad=structuredClone(bundle);mutate(bad);await assert.rejects(()=>validateCompleteBundle(bad));}
});

test('four source diagnostics use five assets per output, preserve the old four-asset cap, and decode all six unique PNGs once',async()=>{
 const state=await gallery(),bundle=comparisonBundle(state,state.groups[0].id);await assert.rejects(()=>diagnosticRequest(bundle),/5枚/);const request=await diagnosticRequest(bundle,[state.images[0].id]);assert.equal(request.assetVersion,f.expected.assetVersion);assert.equal(request.assets.length,5);assert.equal(request.images[0].additionalSourcePhotoAssetIds.length,3);const response=analyzePngAssets(request);assert.equal(response.analysisVersion,f.expected.analysisVersion);assert.equal(response.assets.length,5);assert.equal(response.images[0].qualityScore,null);
 for(const assetVersion of ['image-assets-1.0.0','image-assets-1.1.0'])assert.throws(()=>analyzePngAssets({...request,assetVersion}),e=>e.code==='INVALID_DIAGNOSTIC_INPUT');
 let decoded=0;const analysis=createCompleteReviewAnalysis({decode:bytes=>{decoded++;return decodePng(bytes);}});await analysis.consume(bundle);await analysis.consume(bundle);const dataset=analysis.finish();assert.equal(decoded,6);assert.equal(dataset.assets.length,6);assert.equal(dataset.version,'complete-evaluation-dataset-1.11.0');assert.equal(dataset.analysisVersion,f.expected.analysisVersion);assert.equal(dataset.groups[0].additionalSourcePhotoAssetIds.length,3);assert.match(completePreview(dataset),/追加写真 3/);assert.ok(!JSON.stringify(dataset).includes('data:image/'));assert.equal(dataset.assessment,null);
});

test('four-photo draft backup and input freeze preserve source-4, original files and crop without consent',async()=>{
 const v=draft(),blob=await createDraftBackup(v),files=await readZip(new Uint8Array(await blob.arrayBuffer())),manifest=JSON.parse(decodeText(files.get('editor-backup.json')));assert.equal(manifest.version,f.expected.backupVersion);const restored=await readDraftBackup(new Uint8Array(await blob.arrayBuffer()));assert.equal(restored.additionalPhotos.length,3);assert.equal(await restored.additionalPhotos[2].file.text(),'raw-2');assert.equal(restored.additionalPhotos[2].imageDataUrl,sources[3]);assert.deepEqual(restored.settings,v.settings);assert.deepEqual(restored.result.sourcePhotoSha256s,hashes);assert.equal(restored.consent,undefined);
 const {consent,...plain}=input(),fixed=await freezeValidationA(plain);assert.equal(fixed.version,f.expected.fixedVersion);assert.equal(fixed.service.generationVersion,f.generationVersion);assert.equal(fixed.additionalSources[2].path,'source-4.png');assert.deepEqual(fixed.additionalSources.map(x=>x.sha256),hashes.slice(1));await assertValidationAInput(fixed,input());const zip=await readZip(new Uint8Array(await(await validationAZip(fixed,sources[0],sources.slice(1))).arrayBuffer()));assert.equal(sha(zip.get('source-4.png')),hashes[3]);assert.throws(()=>validationACase({...fixed,version:'validation-a-case-1.1.0'}));
 const withFixed=await readDraftBackup(new Uint8Array(await(await createDraftBackup({...v,validationA:fixed})).arrayBuffer()));assert.equal(withFixed.validationA.additionalSources.length,3);
 const badManifest=structuredClone(manifest);badManifest.version='photo-editor-backup-1.1.0';files.set('editor-backup.json',utf8(JSON.stringify(badManifest)));const wrongVersion=await writeZip([...files].map(([name,data])=>({name,data})));await assert.rejects(async()=>readDraftBackup(new Uint8Array(await wrongVersion.arrayBuffer())),/形式/);
});

test('HTTP accepts four bounded photos above the old freeze body cap without calling an image provider',async()=>{
 let calls=0;const server=makeServer({complete:async body=>generateComplete(body,{generate:async()=>{calls++;return dataUrl(png());}})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const big=sources.map((url,i)=>{const bytes=Buffer.from(url.slice(22),'base64');return dataUrl(Buffer.concat([bytes.subarray(0,-12),chunk('tEXt',Buffer.concat([Buffer.from('Synthetic\0'),Buffer.alloc(2*1024*1024,i+1)])),bytes.subarray(-12)]));}),{consent,...plain}=input(),body=JSON.stringify({...plain,imageDataUrl:big[0],additionalImageDataUrls:big.slice(1)});assert.ok(Buffer.byteLength(body)>10*1024*1024);assert.ok(Buffer.byteLength(body)<14*1024*1024);const r=await fetch(base+'/api/v1/validation-a/freeze',{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(r.status,200);assert.equal((await r.json()).additionalSources.length,3);assert.equal(calls,0);
  const generated=await fetch(base+'/api/v1/complete-thumbnail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input())});assert.equal(generated.status,200);assert.equal((await generated.json()).sourcePhotoSha256s.length,4);assert.equal(calls,1);
 }finally{await new Promise(r=>server.close(r));}
});

test('the editor revision action restores all four sent photos, including the third additional photo',async()=>{
 const state=await gallery(),source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function prepareRevision('),source.indexOf("document.querySelector('#cancel-revision')"));let applied;
 const nodes={'#clear-draft':{disabled:false},'#editor-workspace':{disabled:false},'#revision-tools':{scrollIntoView(){}}},scope={File,Blob,fromDataUrl:url=>Buffer.from(url.slice(22),'base64'),captureCurrentDraft:draft,document:{querySelector:id=>nodes[id]},completedResult:null,applyImportedDraft:async value=>applied=value};runInNewContext(code+';globalThis.prepare=prepareRevision;',scope);await scope.prepare({group:state.groups[0],image:state.images[0],instruction:'写真を自然に'});assert.equal(applied.additionalPhotos.length,3);assert.deepEqual(Array.from(applied.additionalPhotos,x=>x.imageDataUrl),sources.slice(1));assert.equal(applied.revision.sourceImageDataUrl,sources[0]);assert.equal(nodes['#editor-workspace'].disabled,false);
});
