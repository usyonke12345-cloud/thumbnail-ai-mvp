import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {normalizeReferenceEmphasis} from '../shared/reference-emphasis.mjs';
import {createReferenceStore,validateReferenceObservation} from '../backend/references/store.mjs';
import {prepareCompleteReferences} from '../backend/references/selection.mjs';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {generateComplete,completeGenerationVersion} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {freezeValidationA,checkValidationARequest} from '../backend/validation-a.mjs';
import {createEntry,addToGallery,comparisonBundle,comparisonReport} from '../frontend/complete-gallery-model.js';
import {createCompleteShareZip,validateCompleteBundle} from '../frontend/complete-png-transfer.js';
import {readComparisonFile} from '../frontend/local-archive.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';
const f=JSON.parse(await readFile(new URL('../docs/fixtures/text-emphasis.json',import.meta.url),'utf8')),four=JSON.parse(await readFile(new URL('../docs/fixtures/four-photos.json',import.meta.url),'utf8')),now=new Date('2026-11-02T00:00:00Z'),sha=b=>createHash('sha256').update(b).digest('hex');
const rows=()=>Array.from({length:100},(_,i)=>{const videoId='t'+String(i).padStart(10,'0'),bytes=png(320,180,[i,40,60,255]),hash=sha(bytes);return {videoId,metadata:{videoId,url:'https://www.youtube.com/watch?v='+videoId,thumbnailUrl:'https://i.ytimg.com/vi/'+videoId+'/hqdefault.jpg',channelId:'UC'+String(i).padStart(22,'0'),title:'Synthetic',verification:'youtube_data_api',viewCount:'1000001',durationSeconds:400,publishedAt:'2026-10-01T00:00:00Z',checkedAt:now.toISOString()},asset:{sha256:hash,mimeType:'image/png',extension:'png',bytes:bytes.length,width:320,height:180,cachedAt:now.toISOString()},observation:{version:'thumbnail-reference-observation-1.0.0',method:'visual_record',observedAt:now.toISOString(),observer:'assistant',thumbnailSha256:hash,genres:['daily_life'],moods:['refined'],material:'multi_photo',typography:'Synthetic',layout:'Synthetic '+i,when:'Synthetic',avoid:'Synthetic',emphasis:structuredClone(f.observation)},imageUse:{generationAllowed:false,basis:null}};});
function settings(records){return {now,store:{snapshot:async()=>({catalog:{version:'thumbnail-reference-catalog-1.0.0',records},bytesFor(){throw new Error('No reference upload allowed');}})}};}
const input=n=>({...four.input,title:f.cases[0].title,visualIntent:'上品で落ち着いた文字。自然な写真。',referenceMode:'required',consent:true,...(n>1?{additionalImageDataUrls:four.input.additionalImageDataUrls.slice(0,n-1)}:{additionalImageDataUrls:undefined})});

test('text observations distinguish selective, uniform, absent and uncertain emphasis without guessed spans or unbounded text',()=>{
 assert.deepEqual(normalizeReferenceEmphasis(f.observation),f.observation);
 for(const mode of ['uniform','no_text','uncertain'])assert.equal(normalizeReferenceEmphasis({...f.observation,mode,spans:[]}).mode,mode);
 for(const change of [{mode:'unknown'},{mode:'no_text'},{spans:[]},{spans:Array(4).fill(f.observation.spans[0])},{relationship:' '},{extra:true},{spans:[{...f.observation.spans[0],role:'ctr_winner'}]},{spans:[{...f.observation.spans[0],text:'x'.repeat(51)}]},{spans:[{...f.observation.spans[0],treatments:['color','color']}]},{spans:[{...f.observation.spans[0],appearance:'\u0000bad'}]}])assert.throws(()=>normalizeReferenceEmphasis({...f.observation,...change}));
 const r=rows()[0],{version,method,observedAt,...base}=r.observation;delete base.emphasis;const legacy=validateReferenceObservation({...base,videoId:r.videoId,generationAllowed:false});assert.equal(legacy.emphasis,undefined);
 assert.deepEqual(validateReferenceObservation({...base,videoId:r.videoId,generationAllowed:false,emphasis:f.observation}).emphasis,f.observation);
});

test('emphasis observations persist only against the visually inspected thumbnail hash and never grant image upload permission',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'thumbnail-emphasis-'));t.after(async()=>{assert.ok(resolve(dir).startsWith(resolve(tmpdir())+sep)&&basename(dir).startsWith('thumbnail-emphasis-'));await rm(dir,{recursive:true,force:true});});const root=pathToFileURL(dir+sep),r=rows()[0];delete r.observation.emphasis;await writeFile(new URL('catalog.json',root),JSON.stringify({version:'thumbnail-reference-catalog-1.0.0',records:[r]}));const store=createReferenceStore({root,clock:()=>now,fetchImpl(){throw new Error('No network');}}),{version,method,observedAt,...base}=r.observation,body={...base,videoId:r.videoId,generationAllowed:false,emphasis:f.observation};
 await store.observe(body);const saved=(await store.snapshot()).catalog.records[0];assert.deepEqual(saved.observation.emphasis,f.observation);assert.equal(saved.imageUse.generationAllowed,false);
 const before=await readFile(new URL('catalog.json',root),'utf8');await assert.rejects(()=>store.observe({...body,thumbnailSha256:'f'.repeat(64)}),e=>e.code==='REFERENCE_CHANGED');assert.equal(await readFile(new URL('catalog.json',root),'utf8'),before);
});

test('one to four photographs carry semantic emphasis into the same single edit, without copying observed words or changing image settings',async()=>{
 for(let n=1;n<=4;n++){let calls=0;const v=input(n),provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{calls++;assert.equal(body.getAll('image[]').length,n);const prompt=body.get('prompt');assert.match(prompt,/SEMANTIC TEXT EMPHASIS/);assert.match(prompt,/distinguishing person, occupation or achievement/);assert.match(prompt,/number, units and qualifiers together/);assert.match(prompt,/textEmphasis/);assert.match(prompt,/number_or_result/);assert.doesNotMatch(prompt,/42分台/);assert.match(prompt,/NATURAL PHOTO FINISH/);assert.match(prompt,/100 recently qualified/);assert.equal(body.get('quality'),'medium');assert.equal(body.get('n'),'1');return new Response(JSON.stringify({data:[{b64_json:png().toString('base64')}]}));}});const result=await generateComplete(v,{references:settings(rows()),generate:provider});assert.equal(calls,1);assert.equal(result.generation_version,f.generationVersion);assert.equal(result.referenceContext.poolSize,100);assert.equal(result.emphasisVerified,undefined);}
 for(const [n,version]of [[1,'ai-complete-0.10.2'],[2,'ai-complete-0.11.0'],[4,'ai-complete-0.13.0']]){const v={...input(n),referenceMode:'off'};assert.equal(completeGenerationVersion(v),version);assert.doesNotMatch(completePrompt(v),/SEMANTIC TEXT EMPHASIS/);}
 const manual=completePrompt({...input(1),headlineMode:'manual',headline:'人工の固定見出し'});assert.match(manual,/Render exactly the supplied headline/);assert.match(manual,/keep manual headline wording exact/);
});

test('observation-only edits invalidate the frozen pool; new output remains transferable and analyzable without inventing rendered focus',async()=>{
 const records=rows(),v=input(4),references=settings(records),{consent,...plain}=v,fixed=await freezeValidationA(plain,{references});assert.equal(fixed.service.generationVersion,f.generationVersion);assert.ok(fixed.service.files.some(x=>x.path==='backend/generation/complete-emphasis.mjs'));assert.ok(fixed.service.files.some(x=>x.path==='shared/reference-emphasis.mjs'));await checkValidationARequest(v,fixed.caseId,{references});
 records[99].observation.emphasis.relationship='Different synthetic relationship';const prepared=await prepareCompleteReferences(v,references);assert.notEqual(prepared._references.context.poolSha256,fixed.service.referenceContext.poolSha256);await assert.rejects(()=>checkValidationARequest(v,fixed.caseId,{references}),e=>e.code==='VALIDATION_A_MISMATCH');
 const result=await generateComplete(v,{references,generate:async()=>dataUrl(png())}),entry=await createEntry(v,result),gallery=addToGallery({groups:[],images:[],reviews:[]},entry),bundle=comparisonBundle(gallery,gallery.groups[0].id);await validateCompleteBundle(bundle);const report=comparisonReport(gallery),zip=await createCompleteShareZip(report);assert.deepEqual(await readComparisonFile(new File([zip.blob],'synthetic.zip')),report);
 const analysis=createCompleteReviewAnalysis();await analysis.consume(bundle);const dataset=analysis.finish();assert.equal(dataset.images[0].feedbackUsed,false);assert.equal(dataset.images[0].feedbackUsageKnown,true);assert.equal(dataset.assessment,null);assert.ok(!JSON.stringify(dataset).includes('data:image/'));
});

test('saving reference notes preserves emphasis for the same image and drops it when the thumbnail changed',async()=>{
 const nodes=[],e=tag=>{const x={tag,value:'',checked:false,children:[],listeners:{},append(...v){this.children.push(...v);},prepend(...v){this.children.unshift(...v);},replaceChildren(...v){this.children=v;},addEventListener(k,f){this.listeners[k]=f;}};nodes.push(x);return x;},roots=new Map(),r=rows()[0];let thumbnailHash=r.asset.sha256,saved;
 const scope={document:{querySelector:k=>{if(!roots.has(k))roots.set(k,e('root'));return roots.get(k);},createElement:e,createTextNode:text=>({textContent:text})},URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},fetch:async(path,options)=>path.endsWith('/observe')?(saved=JSON.parse(options.body),Response.json({})):path.includes('/thumbnail/')?new Response(png(),{headers:{'X-Thumbnail-SHA256':thumbnailHash}}):Response.json({target:100,metadataQualified:100,visuallyObserved:100,imageUploadAllowed:0,channels:100,youtubeKeyConfigured:true,records:[{...r,eligible:true}]}),Response};
 runInNewContext(await readFile(new URL('../frontend/reference-library.js',import.meta.url),'utf8'),scope);await new Promise(setImmediate);const open=nodes.find(x=>x.textContent==='画像を開いて観察する'),form=nodes.find(x=>x.tag==='form');await open.listeners.click();await form.listeners.submit({preventDefault(){}});assert.deepEqual(saved.emphasis,f.observation);assert.equal(saved.generationAllowed,false);
 thumbnailHash='f'.repeat(64);await open.listeners.click();await form.listeners.submit({preventDefault(){}});assert.equal(saved.emphasis,undefined);
});
