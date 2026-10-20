import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {referenceCriteria,normalizeYouTubeVideo,qualifiesReference,thumbnailUrl,collectYouTubeReferences,createYouTubeClient} from '../backend/references/youtube.mjs';
import {createReferenceStore,validateReferenceObservation} from '../backend/references/store.mjs';
import {prepareCompleteReferences,selectReferenceRows} from '../backend/references/selection.mjs';
import {validateComplete,generateComplete} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {freezeValidationA} from '../backend/validation-a.mjs';
import {validationACase,validationAZip} from '../frontend/validation-a.js';
import {readZip} from '../frontend/local-archive.js';
import {createEntry,addToGallery,comparisonBundle,comparisonReport} from '../frontend/complete-gallery-model.js';
import {validateCompleteImport,createCompleteShareZip} from '../frontend/complete-png-transfer.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {makeServer} from '../backend/server.mjs';
import {createEditorReferences} from '../frontend/editor-references.js';
import {png,dataUrl} from './helpers/complete-png.mjs';
const now=new Date('2026-10-20T00:00:00Z'),hash=x=>createHash('sha256').update(x).digest('hex'),id=i=>'t'+String(i).padStart(10,'0'),channel=i=>'UC'+String(i).padStart(22,'0'),referencePng=png(320,180);
function item(i,changes={}){return {id:id(i),snippet:{title:'Synthetic travel example',channelId:channel(i),channelTitle:'Synthetic',publishedAt:'2026-09-01T00:00:00Z',liveBroadcastContent:'none',thumbnails:{high:{url:'https://i.ytimg.com/vi/'+id(i)+'/hqdefault.jpg'}}},contentDetails:{duration:'PT5M'},statistics:{viewCount:'1000001'},...changes};}
function row(i,{material='scene',allowed=false,channelId=channel(i),shade=i}={}){const metadata=normalizeYouTubeVideo(item(i),now.toISOString());metadata.channelId=channelId;const bytes=png(320,180,[shade,40,80,255]),sha256=hash(bytes);return {videoId:id(i),metadata,asset:{sha256,bytes:bytes.length,mimeType:'image/png',extension:'png',width:320,height:180,cachedAt:now.toISOString()},observation:{version:'thumbnail-reference-observation-1.0.0',method:'visual_record',observer:'assistant',observedAt:now.toISOString(),thumbnailSha256:sha256,genres:['travel'],moods:['calm'],material,typography:'Synthetic upright serif',layout:'Synthetic layout '+i,when:'Synthetic available space',avoid:'Never invent a scene'},imageUse:{generationAllowed:allowed,basis:allowed?'Synthetic owned test fixture':null},testBytes:bytes};}
const catalog=records=>({version:'thumbnail-reference-catalog-1.0.0',criteria:referenceCriteria(now),records:records.map(({testBytes,...r})=>r)});
function memory(rows){const c=catalog(rows);return {snapshot:async()=>({catalog:c,bytesFor:async r=>rows.find(x=>x.videoId===r.videoId).testBytes})};}
const input={title:'人工旅行タイトル',brief:'',visualIntent:'ゆっくりした旅',headlineMode:'auto',headline:null,design:'auto',composition:'auto',referenceMode:'auto',imageDataUrl:dataUrl(png(1280,720)),consent:true};
async function temporary(t){const dir=await mkdtemp(join(tmpdir(),'thumbnail-reference-test-'));t.after(async()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep)&&basename(dir).startsWith('thumbnail-reference-test-'));await rm(dir,{recursive:true,force:true});});return pathToFileURL(dir+sep);}

test('recent means six calendar months, strictly over a million, nonlive including archives, minimum 4 minutes',()=>{
 assert.equal(referenceCriteria(new Date('2026-08-31T00:00:00Z')).publishedAfter,'2026-02-28T00:00:00.000Z');
 const base=normalizeYouTubeVideo(item(1),now.toISOString()),criteria=referenceCriteria(now);assert.ok(qualifiesReference(base,criteria));
 for(const change of [{viewCount:'1000000'},{publishedAt:'2026-04-19T23:59:59Z'},{publishedAt:'2026-10-21T00:00:00Z'},{durationSeconds:239}])assert.equal(qualifiesReference({...base,...change},criteria),false);
 assert.equal(normalizeYouTubeVideo({...item(1),liveStreamingDetails:{actualStartTime:'2026-09-01T00:00:00Z'}},now.toISOString()),null);
 assert.equal(normalizeYouTubeVideo(item(1,{statistics:{viewCount:'not-number'}}),now.toISOString()),null);
 for(const url of ['http://i.ytimg.com/vi/'+id(1)+'/x.jpg','https://evil.test/vi/'+id(1)+'/x.jpg','https://i.ytimg.com/vi/'+id(2)+'/x.jpg','https://i.ytimg.com/vi/'+id(1)+'/x.jpg?key=secret'])assert.throws(()=>thumbnailUrl(url,id(1)));
});

test('collection deduplicates IDs, bounds calls, diversifies channels and refreshes existing metadata',async()=>{
 let search=0,details=0;const client={search:async()=>{search++;return {items:[...Array.from({length:50},(_,i)=>({id:{videoId:id(i+1)}})),{id:{videoId:id(1)}}],nextPageToken:'same-token'};},videos:async ids=>{details++;assert.equal(new Set(ids).size,ids.length);assert.ok(ids.length<=50);return {items:ids.map(x=>{const i=Number(x.slice(1)),v=item(i);v.snippet.channelId=channel(Math.ceil(i/10));return v;})};}};
 const c=await collectYouTubeReferences({client,queries:['synthetic one','synthetic two'],maxSearchCalls:4,now:()=>now.toISOString(),criteria:referenceCriteria(now),existingMetadata:[normalizeYouTubeVideo(item(99),now.toISOString())]});
 assert.ok(search<=4);assert.ok(details<=4);assert.equal(new Set(c.records.map(x=>x.videoId)).size,c.records.length);assert.ok(c.records.length<100);assert.equal(c.collection.complete,false);
 const counts=new Map();for(const r of c.records)counts.set(r.metadata.channelId,(counts.get(r.metadata.channelId)??0)+1);assert.ok([...counts.values()].every(n=>n<=5));assert.ok(c.records.some(x=>x.videoId===id(99)));assert.ok(c.records.every(x=>x.observation===null&&!x.imageUse.generationAllowed));
});

test('YouTube client never leaks keys in URLs or upstream errors and a missing key makes no request',async()=>{
 let calls=0;const secret='synthetic-key-never-log';const client=createYouTubeClient({apiKey:secret,fetchImpl:async(url,options)=>{calls++;assert.ok(!url.href.includes(secret));assert.equal(options.headers['X-Goog-Api-Key'],secret);assert.equal(options.redirect,'error');return new Response(secret,{status:403});}});
 await assert.rejects(()=>client.search('synthetic',referenceCriteria(now)),e=>e.code==='YOUTUBE_API_ERROR'&&!e.message.includes(secret));assert.equal(calls,1);
 await assert.rejects(()=>createYouTubeClient({apiKey:'',fetchImpl:()=>{throw new Error('Must not call');}}).videos([id(1)]),e=>e.code==='YOUTUBE_KEY_MISSING');
});

test('private cache binds observations to actual image hash; changed content revokes upload permission',async t=>{
 const root=await temporary(t),r=row(1),c=catalog([r]);c.records[0].asset=null;c.records[0].observation=null;await writeFile(new URL('catalog.json',root),JSON.stringify(c));
 let bytes=referencePng,calls=0;const store=createReferenceStore({root,clock:()=>now,fetchImpl:async()=>{calls++;return new Response(bytes,{headers:{'content-type':'image/png'}});}});
 const a=await store.thumbnail(id(1));assert.equal(a.sha256,hash(bytes));assert.deepEqual(a.bytes,bytes);
 const observation={videoId:id(1),thumbnailSha256:a.sha256,observer:'assistant',genres:['travel'],moods:['calm'],material:'scene',typography:'Upright serif',layout:'Lower caption',when:'Free lower margin',avoid:'Do not cover faces',generationAllowed:true,permissionBasis:'Synthetic test owned'};
 await assert.rejects(()=>store.observe({...observation,thumbnailSha256:'a'.repeat(64)}),e=>e.code==='REFERENCE_CHANGED');
 await store.observe(observation);assert.equal((await store.list()).visuallyObserved,1);await store.thumbnail(id(1));assert.equal(calls,1);
 await rm(new URL('assets/'+a.sha256+'.png',root));bytes=png(320,180,[80,60,40,255]);await store.thumbnail(id(1));const changed=await store.list();assert.equal(changed.visuallyObserved,0);assert.equal(changed.records[0].imageUse.generationAllowed,false);
 assert.throws(()=>validateReferenceObservation({...observation,permissionBasis:''}));
});

test('metadata, independent image cache and orphan images are deleted after 30 days',async t=>{
 const root=await temporary(t),r=row(1);r.metadata.checkedAt='2026-09-19T00:00:00Z';await mkdir(new URL('assets/',root));await writeFile(new URL('catalog.json',root),JSON.stringify(catalog([r])));await writeFile(new URL('assets/'+r.asset.sha256+'.png',root),r.testBytes);
 const orphan=new URL('assets/'+'a'.repeat(64)+'.png',root);await writeFile(orphan,referencePng);await utimes(orphan,new Date('2026-09-01'),new Date('2026-09-01'));
 const store=createReferenceStore({root,clock:()=>now}),list=await store.list();assert.equal(list.metadataQualified,0);assert.equal(list.records[0].metadata,null);assert.equal(list.records[0].asset,null);assert.equal(list.records[0].observation.observer,'assistant');
 await assert.rejects(()=>stat(orphan),e=>e.code==='ENOENT');await assert.rejects(()=>stat(new URL('assets/'+r.asset.sha256+'.png',root)),e=>e.code==='ENOENT');
});

test('retrieval separates material modes, rejects stale/unobserved examples, avoids duplicate channels and thumbnails',async()=>{
 const rows=[row(1),row(2,{channelId:channel(1)}),row(3,{material:'cutout'}),row(4),row(5),row(6),row(7)];rows[3].observation=null;rows[4].metadata.checkedAt='2026-09-01T00:00:00Z';
 const c=catalog(rows),selected=selectReferenceRows(input,c,{now});assert.deepEqual(selected.map(x=>x.videoId),[id(1),id(6),id(7)]);
 assert.deepEqual(selectReferenceRows({...input,design:'recompose'},c,{now}).map(x=>x.videoId),[id(3)]);
 for(const v of [{design:'editorial'},{composition:'text_left'},{revision:{instruction:'text only'}}])assert.equal(selectReferenceRows({...input,...v},c,{now}).length,0);
 const off=await prepareCompleteReferences({...input,referenceMode:'off'},{store:{snapshot(){throw new Error('Do not read');}}});assert.equal(off._references,undefined);
});

test('one paid image edit receives original first, only permitted references and generic observations, with an auditable receipt',async()=>{
 const rows=[row(1,{allowed:true}),row(2)],store=memory(rows);let calls=0;
 const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{calls++;assert.match(url,/images\/edits$/);assert.equal(body.get('n'),'1');assert.equal(body.get('quality'),'medium');const images=body.getAll('image[]');assert.equal(images.length,2);assert.deepEqual(Buffer.from(await images[0].arrayBuffer()),png(1280,720));assert.deepEqual(Buffer.from(await images[1].arrayBuffer()),rows[0].testBytes);const prompt=body.get('prompt');assert.match(prompt,/RETRIEVED REFERENCE OBSERVATIONS/);assert.match(prompt,/did not analyze the source photograph/);assert.match(prompt,/STYLE AND COMPOSITION ONLY/);assert.doesNotMatch(prompt,/Synthetic travel example|https:\/\/www.youtube/);return new Response(JSON.stringify({data:[{b64_json:png().toString('base64')}]}));}});
 const result=await generateComplete(input,{generate:provider,references:{store,now}});assert.equal(calls,1);assert.deepEqual(result.referenceContext.candidates.map(x=>x.imageSent),[true,false]);assert.equal(result.assessment,undefined);assert.ok(result.limitations.some(x=>x.includes('実際に選ばれた型')));
});

test('frozen A ZIP binds reference notes and sent assets, rejecting altered assets and preserving old snapshots',async()=>{
 const {consent,...v}=input,store=memory([row(1,{allowed:true})]),fixed=await freezeValidationA(v,{references:{store,now}});assert.equal(fixed.referenceAssets.length,1);assert.deepEqual(validationACase(fixed),fixed);const files=await readZip(new Uint8Array(await(await validationAZip(fixed,v.imageDataUrl)).arrayBuffer()));assert.deepEqual(Buffer.from(files.get(fixed.referenceAssets[0].path)),row(1).testBytes);
 const bad=JSON.parse(JSON.stringify(fixed));bad.referenceAssets[0].dataUrl=dataUrl(png(320,180,[10,20,30,255]));await assert.rejects(()=>validationAZip(bad,v.imageDataUrl),/ハッシュ/);
 const changed=row(1,{allowed:true});changed.observation.layout='Changed generic relationship';const again=await freezeValidationA(v,{references:{store:memory([changed]),now}});assert.notEqual(again.caseId,fixed.caseId);let generated=0;await assert.rejects(()=>generateComplete(input,{references:{store:memory([changed]),now},expectedReferenceContext:fixed.service.referenceContext,generate:async()=>{generated++;}}),e=>e.code==='VALIDATION_A_MISMATCH');assert.equal(generated,0);
 const {referenceMode,...old}=v,legacy=await freezeValidationA(old);assert.equal(legacy.service.referenceContext,undefined);await validationAZip(legacy,old.imageDataUrl);
});

test('reference provenance survives gallery JSON/share ZIP and analysis without becoming a score or human judgment',async()=>{
 const value=await generateComplete(input,{generate:async()=>dataUrl(png()),references:{store:memory([row(1)]),now}}),entry=await createEntry(input,value,{id:'synthetic-result'}),state=addToGallery({groups:[],images:[],reviews:[]},entry),bundle=comparisonBundle(state,entry.group.id);assert.equal(bundle.version,'complete-comparison-1.9.0');
 const checked=(await validateCompleteImport(bundle))[0];assert.deepEqual(checked.images[0].result.referenceContext,value.referenceContext);assert.equal(checked.images[0].referenceMode,'auto');
 const zip=await createCompleteShareZip(comparisonReport(state));assert.ok(zip.blob.size>0);const analysis=createCompleteReviewAnalysis();await analysis.consume(checked);const result=analysis.finish();assert.equal(result.version,'complete-evaluation-dataset-1.8.0');assert.deepEqual(result.images[0].result.referenceContext,value.referenceContext);assert.equal(result.assessment,null);assert.equal(result.reviews.length,0);
});

test('free preview and library UI do not reach a generation provider',async()=>{
 let generated=0;const rows=[row(1)];rows[0].metadata.checkedAt='2026-10-01T00:00:00Z';const library={...memory(rows),list:async()=>({metadataQualified:1,visuallyObserved:1,records:[]})},server=makeServer({referenceLibrary:library,referenceClock:()=>now,complete:async()=>{generated++;throw new Error('Must not generate');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{for(const path of ['/reference-library','/reference-library.js','/editor-references.js','/shared/thumbnail-references.mjs'])assert.equal((await fetch(url+path)).status,200);const response=await fetch(url+'/api/v1/reference-library/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:input.title,design:'auto'})});assert.equal(response.status,200);assert.equal((await response.json()).context.status,'supplied');assert.equal(generated,0);}finally{await new Promise(r=>server.close(r));}
 const nodes=[],document={createElement:tag=>{const node={tag,textContent:'',events:{},setAttribute(){},addEventListener(event,fn){this.events[event]=fn;},replaceChildren(){},append(){}};nodes.push(node);return node;}},root=document.createElement('section'),modeControl=document.createElement('select');modeControl.value='auto';const requests=[],context=(await prepareCompleteReferences(validateComplete(input),{store:memory(rows),now}))._references.context;
 const app=createEditorReferences({root,document,modeControl,capture:()=>({title:'Synthetic'}),fetchImpl:async(path)=>{requests.push(path);return new Response(JSON.stringify(path.endsWith('/preview')?{context,candidates:[],note:'No generation'}:{metadataQualified:1,visuallyObserved:1}));}});await app.ready;await nodes.find(x=>x.tag==='button').events.click();assert.deepEqual(requests,['/api/v1/reference-library','/api/v1/reference-library/preview']);
});
