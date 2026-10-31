import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {validateComplete,generateComplete} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {prepareCompleteReferences} from '../backend/references/selection.mjs';
import {normalizeReferenceContext,referenceContextText} from '../shared/thumbnail-references.mjs';
import {normalizeVisualIntent,requireVisualIntent} from '../shared/complete-designs.mjs';
import {freezeValidationA,checkValidationARequest} from '../backend/validation-a.mjs';
import {validationAZip,validationACase} from '../frontend/validation-a.js';
import {createEntry,addToGallery,comparisonBundle,comparisonReport} from '../frontend/complete-gallery-model.js';
import {createCompleteShareZip,validateCompleteBundle} from '../frontend/complete-png-transfer.js';
import {readComparisonFile} from '../frontend/local-archive.js';
import {createDraftBackup,readDraftBackup} from '../frontend/editor-backup.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {makeServer} from '../backend/server.mjs';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {completePhotoFinishInstructions} from '../backend/generation/complete-photo-finish.mjs';
import {feedbackUsage} from '../backend/analysis/feedback-audit.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';

const now=new Date('2026-10-31T00:00:00Z'),sha=x=>createHash('sha256').update(x).digest('hex');
const input=()=>({title:'人工データ：旅の一日',brief:'',visualIntent:'ゆっくり落ち着いた旅。自然な写真と穏やかな文字。',referenceMode:'required',headlineMode:'auto',headline:null,design:'auto',composition:'auto',imageDataUrl:dataUrl(png(1280,720)),consent:true});
const rows=Array.from({length:100},(_,i)=>{const bytes=png(320,180,[i+1,60,80,255]),videoId='t'+String(i).padStart(10,'0');return {videoId,metadata:{videoId,url:'https://www.youtube.com/watch?v='+videoId,channelId:'UC'+String(i).padStart(22,'0'),title:'Never copy this source wording',verification:'youtube_data_api',viewCount:'1000001',durationSeconds:400,publishedAt:'2026-10-01T00:00:00Z',checkedAt:now.toISOString()},asset:{sha256:sha(bytes),mimeType:'image/png',extension:'png',bytes:bytes.length},observation:{thumbnailSha256:sha(bytes),genres:['travel'],moods:[i<50?'energetic':'calm'],material:i%3===0?'multi_photo':'scene',typography:'Synthetic family '+i,layout:'Synthetic layout '+i,when:'Synthetic useful space',avoid:'Never invent a person'},imageUse:{generationAllowed:false},testBytes:bytes};});
function store(records=rows){const catalog={version:'thumbnail-reference-catalog-1.0.0',records:records.map(({testBytes,...r})=>r)};return {snapshot:async()=>({catalog,bytesFor:async row=>records.find(x=>x.videoId===row.videoId).testBytes})};}
const settings=records=>({store:store(records),now});

test('required references require a nonblank atmosphere before a provider or library request; historical API input remains readable',async()=>{
 assert.equal(normalizeVisualIntent(undefined),'');assert.equal(requireVisualIntent('  calm  '),'calm');
 for(const visualIntent of [undefined,'',' \n　',null]){let calls=0;await assert.rejects(()=>generateComplete({...input(),visualIntent},{references:{store:{snapshot(){calls++;throw Error('must not read');}},now},generate:async()=>{calls++;}}),e=>['VISUAL_INTENT_REQUIRED','INVALID_INPUT'].includes(e.code));assert.equal(calls,0);}
 for(const referenceMode of ['auto','off',undefined])assert.equal(validateComplete({...input(),referenceMode,visualIntent:''}).visualIntent,'');
});

test('required references count actual fresh, hash-bound observations instead of trusting a claimed library summary',async()=>{
 for(const mutate of [r=>r.pop(),r=>r[0].observation=null,r=>r[0].observation.thumbnailSha256='f'.repeat(64),r=>r[0].metadata.viewCount='1000000',r=>r[0].metadata.checkedAt='2026-09-01T00:00:00Z',r=>r[0].metadata.publishedAt='2026-01-01T00:00:00Z']){
  const records=structuredClone(rows);mutate(records);let generated=0;await assert.rejects(()=>generateComplete(input(),{references:settings(records),generate:async()=>{generated++;return dataUrl(png());}}),e=>e.code==='REFERENCE_LIBRARY_INCOMPLETE');assert.equal(generated,0);
 }
});

test('all 100 examples form the auditable pool; atmosphere is ranked before the video topic and changes the shortlist',async()=>{
 const calm=await prepareCompleteReferences(validateComplete(input()),settings()),active=await prepareCompleteReferences(validateComplete({...input(),visualIntent:'力強く元気な旅。インパクト。'}),settings());
 assert.equal(calm._references.context.poolSize,100);assert.equal(calm._references.rows.length,5);assert.ok(calm._references.rows.every(x=>x.observation.moods.includes('calm')));assert.ok(active._references.rows.every(x=>x.observation.moods.includes('energetic')));
 assert.equal(calm._references.context.poolSha256,active._references.context.poolSha256);assert.notEqual(calm._references.context.visualIntentSha256,active._references.context.visualIntentSha256);assert.notDeepEqual(calm._references.context.candidates,active._references.context.candidates);
 assert.equal(new Set(calm._references.rows.map(x=>x.metadata.channelId)).size,5);assert.match(referenceContextText(calm._references.context),/100実例/);
 const changed=structuredClone(rows);changed[0].observation.typography='Changed unselected record';const again=await prepareCompleteReferences(validateComplete(input()),settings(changed));assert.notEqual(again._references.context.poolSha256,calm._references.context.poolSha256);
});

test('one mocked multi-photo edit receives atmosphere-first observations, source-only people constraints and correct revision reference indexes',async()=>{
 const records=structuredClone(rows);for(const row of records)row.imageUse.generationAllowed=true;
 const v={...input(),additionalImageDataUrls:[dataUrl(png(1280,720,[1,2,3,255]))],revision:{parentImageId:'synthetic-parent',instruction:'文字を穏やかに',imageDataUrl:dataUrl(png())}};let calls=0;
 const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{calls++;const prompt=body.get('prompt');assert.match(prompt,/100 recently qualified/);assert.match(prompt,/primary style brief/);assert.match(prompt,/Images 1 through 2 are the only photographic material/);assert.match(prompt,/Reference image 4 illustrates candidate 1/);assert.doesNotMatch(prompt,/Never copy this source wording/);assert.ok(prompt.length<30000);assert.equal(body.getAll('image[]').length,8);assert.equal(body.get('n'),'1');assert.equal(body.get('model'),'gpt-image-2.5-flare');assert.equal(body.get('quality'),'medium');return new Response(JSON.stringify({data:[{b64_json:png().toString('base64')}]}));}});
 const result=await generateComplete(v,{generate:provider,references:settings(records)});assert.equal(calls,1);assert.equal(result.generation_version,'ai-complete-0.12.1');assert.equal(result.sourcePhotoSha256s.length,2);assert.equal(result.referenceContext.poolSize,100);
});

test('the 100-example receipt and atmosphere survive JSON, ZIP, analysis, draft and fixed inputs, while changed intent is rejected',async()=>{
 const v=input(),result=await generateComplete(v,{references:settings(),generate:async()=>dataUrl(png())}),entry=await createEntry(v,result,{id:'synthetic-required'}),state=addToGallery({groups:[],images:[],reviews:[]},entry),bundle=comparisonBundle(state,entry.group.id);await validateCompleteBundle(bundle);
 await assert.rejects(()=>createEntry({...v,visualIntent:'Different feeling'},result),/イメージ/);
 const shared=await createCompleteShareZip(comparisonReport(state)),restored=await readComparisonFile(new File([shared.blob],'synthetic.zip'));assert.deepEqual(restored.sets[0].images[0].result.referenceContext,result.referenceContext);
 const analysis=createCompleteReviewAnalysis();await analysis.consume(bundle);assert.deepEqual(analysis.finish().images[0].result.referenceContext,result.referenceContext);
 const {consent,...plain}=v,fixed=await freezeValidationA(plain,{references:settings()});assert.equal(validationACase(fixed).input.referenceMode,'required');assert.equal(fixed.service.generationVersion,'ai-complete-0.12.1');await validationAZip(fixed,v.imageDataUrl);
 const receipt=await checkValidationARequest(v,fixed.caseId,{references:settings()});assert.equal(receipt.referenceContext.poolSize,100);
 const changed=structuredClone(rows);changed[0].observation.layout='Changed unselected example';let calls=0;await assert.rejects(()=>generateComplete(v,{references:settings(changed),expectedReferenceContext:fixed.service.referenceContext,generate:async()=>{calls++;}}),e=>e.code==='VALIDATION_A_MISMATCH');assert.equal(calls,0);
 const draft={version:1,layout:'single',settings:[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}],files:[new Blob([png(1280,720)],{type:'image/png'}),null],title:v.title,referenceMode:'required',visualIntent:v.visualIntent,result,validationA:fixed};const backup=await readDraftBackup(new Uint8Array(await(await createDraftBackup(draft)).arrayBuffer()));assert.equal(backup.referenceMode,'required');assert.deepEqual(backup.result.referenceContext,result.referenceContext);assert.equal(backup.consent,undefined);
});

test('new context rejects missing or invented pool claims while old reference contexts stay compatible',async()=>{
 const prepared=await prepareCompleteReferences(validateComplete(input()),settings()),context=prepared._references.context;assert.deepEqual(normalizeReferenceContext(context),context);
 for(const change of [{poolSize:99},{poolSha256:'bad'},{visualIntentSha256:'bad'},{selectionMethod:'content_tags_then_image_model'},{status:'skipped'},{version:'thumbnail-reference-context-1.0.0'}])assert.throws(()=>normalizeReferenceContext({...context,...change}));
 const {poolSize,poolSha256,visualIntentSha256,...old}=context;old.version='thumbnail-reference-context-1.0.0';old.selectionMethod='content_tags_then_image_model';assert.deepEqual(normalizeReferenceContext(old),old);
});

test('the real editor blocks an empty required image brief, focuses the field and never starts a request',async()=>{
 const source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('async function captureAIInput()')).split('// Draft lifecycle')[0];let callback,calls=0,focused=0;
 const nodes={'#ai-complete':{addEventListener:(type,fn)=>callback=fn},'#ai-reference-mode':{value:'required'},'#ai-visual-intent':{value:'　 ',focus(){focused++;}},'#ai-consent':{checked:true}};
 const scope={document:{querySelector:id=>nodes[id]},layout:{value:'single'},photos:[{}],aiStatus:{textContent:''},fetch(){calls++;throw Error('must not request');}};runInNewContext(code,scope);await callback({currentTarget:{disabled:false}});assert.equal(calls,0);assert.equal(focused,1);assert.match(scope.aiStatus.textContent,/イメージを入力/);
});

test('free required preview and freeze use the same atmosphere and pool; a deficient pool never reaches a fake paid provider',async()=>{
 let calls=0;const server=makeServer({referenceLibrary:store(),referenceClock:()=>now,complete:async()=>{calls++;}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{const v=input(),body={title:v.title,visualIntent:v.visualIntent,referenceMode:'required'},r=await fetch(base+'/api/v1/reference-library/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(r.status,200);const preview=await r.json();assert.equal(preview.context.poolSize,100);assert.equal(preview.candidates.length,5);assert.equal(calls,0);
  const bad=await fetch(base+'/api/v1/reference-library/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,visualIntent:''})});assert.equal(bad.status,400);assert.equal(calls,0);
  const multi=await fetch(base+'/api/v1/reference-library/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,sourcePhotoCount:4})});assert.equal(multi.status,200);const multiPreview=await multi.json(),actual=await prepareCompleteReferences(validateComplete({...v,additionalImageDataUrls:[10,40,70].map(c=>dataUrl(png(1280,720,[c,c+1,c+2,255])))}),settings());assert.deepEqual(multiPreview.context.candidates,actual._references.context.candidates);
  for(const sourcePhotoCount of [0,5,1.5]){const badCount=await fetch(base+'/api/v1/reference-library/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,sourcePhotoCount})});assert.equal(badCount.status,400);}assert.equal(calls,0);
 }finally{await new Promise(r=>server.close(r));}
});

test('natural photo finishing applies to every required-reference design while explicit photo panels avoid a forced cutout',()=>{
 for(const design of ['auto','photo_focus','editorial','impact','recompose'])for(const multi of [false,true]){
  const v=validateComplete({...input(),design,...(multi?{additionalImageDataUrls:[dataUrl(png(1280,720,[1,2,3,255]))]}:{}),visualIntent:'写真を3枚横に等間隔。人物を中央、上に見出し。'}),prompt=completePrompt(v);
  assert.match(prompt,/NATURAL PHOTO FINISH/);assert.match(prompt,/slightly soft original must remain naturally soft/);assert.match(prompt,/Do not transfer their color grade/);assert.match(prompt,/only small corrections/);assert.match(prompt,/Do not force a separate subject cutout/);assert.ok(prompt.length<30000);
  if(multi&&design==='recompose')assert.doesNotMatch(prompt,/Isolate at least one existing person/);
 }
 for(const referenceMode of ['auto','off',undefined])assert.equal(completePhotoFinishInstructions({...input(),referenceMode}),'');
});

test('historical 0.12.0 outputs remain importable and distinguishable after the gentle 0.12.1 change',async()=>{
 const v=input(),current=await generateComplete(v,{references:settings(),generate:async()=>dataUrl(png())});assert.equal(current.generation_version,'ai-complete-0.12.1');
 const old={...current,generation_version:'ai-complete-0.12.0'},entry=await createEntry(v,old,{id:'synthetic-old-0120'}),bundle=comparisonBundle(addToGallery({groups:[],images:[],reviews:[]},entry),entry.group.id),restored=await validateCompleteBundle(bundle);assert.equal(restored.images[0].result.generation_version,'ai-complete-0.12.0');
 for(const result of [current,old])assert.equal(feedbackUsage({result}).feedbackUsageKnown,true);
 const {consent,...plain}=v,fixed=await freezeValidationA(plain,{references:settings()});assert.equal(fixed.service.generationVersion,'ai-complete-0.12.1');assert.ok(fixed.service.files.some(x=>x.path==='backend/generation/complete-photo-finish.mjs'));
 const {referenceMode,...legacy}=v,single=await generateComplete(legacy,{generate:async()=>dataUrl(png())});assert.equal(single.generation_version,'ai-complete-0.10.2');assert.doesNotMatch(completePrompt(validateComplete(legacy)),/NATURAL PHOTO FINISH/);
});

test('four photos retain required atmosphere, the 100-example pool and natural finishing in generation 0.13.0',async()=>{
 const v={...input(),additionalImageDataUrls:[10,40,70].map(c=>dataUrl(png(1280,720,[c,c+1,c+2,255])))};let calls=0;
 const result=await generateComplete(v,{references:settings(),generate:async value=>{calls++;const prompt=completePrompt(value);assert.match(prompt,/Images 1 through 4 are the only photographic material/);assert.match(prompt,/NATURAL PHOTO FINISH/);assert.match(prompt,/100 recently qualified/);assert.equal(value.additionalImageDataUrls.length,3);return dataUrl(png());}});assert.equal(calls,1);assert.equal(result.generation_version,'ai-complete-0.13.0');assert.equal(result.referenceContext.poolSize,100);assert.equal(result.sourcePhotoSha256s.length,4);
 const {consent,...plain}=v,fixed=await freezeValidationA(plain,{references:settings()});assert.equal(fixed.version,'validation-a-case-1.2.0');assert.equal(fixed.service.generationVersion,'ai-complete-0.13.0');assert.equal(fixed.additionalSources[2].path,'source-4.png');await validationAZip(fixed,v.imageDataUrl,v.additionalImageDataUrls);
});
