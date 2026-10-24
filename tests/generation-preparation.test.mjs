import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {freezeValidationA,checkValidationARequest} from '../backend/validation-a.mjs';
import {createEntry,comparisonBundle,comparisonReport} from '../frontend/complete-gallery-model.js';
import {validateCompleteImport,createCompleteShareZip} from '../frontend/complete-png-transfer.js';
import {readComparisonFile} from '../frontend/local-archive.js';
import {validateDraft} from '../frontend/editor-draft.js';
import {createDraftBackup,readDraftBackup} from '../frontend/editor-backup.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {feedbackUsage} from '../backend/analysis/feedback-audit.mjs';
import {validateAttempt,createAttemptHistory} from '../frontend/attempt-history.js';
import {png,dataUrl} from './helpers/complete-png.mjs';
const input={title:'港食堂の定食を朝昼晩食べた一日',brief:'',headlineMode:'auto',headline:null,design:'recompose',composition:'auto',imageDataUrl:dataUrl(png(1280,720))};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('source scenery and object fidelity remain binding across all layouts and revisions without adding model calls',async()=>{
 let calls=0;
 for(const design of ['auto','recompose','photo_focus','editorial','impact'])for(const revision of [false,true]){
  const value={...input,consent:true,design,...(revision?{revision:{instruction:'文字を少し小さく',parentImageId:'previous',imageDataUrl:dataUrl(png())}}:{})};
  await generateComplete(value,{generate:async received=>{calls++;const prompt=completePrompt(received);assert.match(prompt,/PHOTO MATERIAL BOUNDARY/);assert.match(prompt,/must remain absent even if named in the title/);assert.match(prompt,/SOURCE OBJECT FIDELITY/);assert.match(prompt,/two-dimensional crop, scale or translation/);assert.match(prompt,/same photographed item/);assert.match(prompt,/COLOR AND LIGHT/);assert.match(prompt,/FINAL MATERIAL CHECK/);assert.match(prompt,/DISTINCTIVE FACTS/);assert.match(prompt,/units, qualifiers and ranges exactly/);assert.match(prompt,/central supported detail visual emphasis/);assert.ok(prompt.length<30000);return dataUrl(png());}});
 }
 assert.equal(calls,10);assert.equal(COMPLETE_GENERATION_VERSION,'ai-complete-0.10.2');
 const manual=completePrompt({...input,headlineMode:'manual',headline:'港食堂'});assert.match(manual,/Render exactly/);assert.doesNotMatch(manual,/DISTINCTIVE FACTS|ARTIFICIAL EDITING EXAMPLES/);
 assert.equal(feedbackUsage({result:{generation_version:COMPLETE_GENERATION_VERSION}}).feedbackUsageKnown,true);
 assert.equal(feedbackUsage({result:{generation_version:'ai-complete-0.10.3'}}).feedbackUsageKnown,false);
});

test('A receipt survives image storage, ZIP, analysis and draft backup and rejects changed inputs instead of silently disappearing',async()=>{
 const fixed=await freezeValidationA(input),receipt=await checkValidationARequest({...input,consent:true},fixed.caseId);
 const result={...await generateComplete({...input,consent:true},{generate:async()=>dataUrl(png())}),validationA:receipt};
 const entry=await createEntry(input,result,{id:'first-output',elapsedMs:1200,expectedValidationACase:fixed.caseId});
 const state={groups:[entry.group],images:[entry.image],reviews:[]},bundle=comparisonBundle(state,entry.group.id);
 assert.equal(bundle.version,'complete-comparison-1.10.0');assert.deepEqual(entry.image.result.validationA,receipt);
 const zip=await createCompleteShareZip(comparisonReport(state));const imported=await validateCompleteImport(await readComparisonFile(zip.blob));assert.deepEqual(imported[0].images[0].result.validationA,receipt);
 const analysis=createCompleteReviewAnalysis();await analysis.consume(imported[0]);const dataset=analysis.finish();assert.equal(dataset.version,'complete-evaluation-dataset-1.9.0');assert.deepEqual(dataset.images[0].result.validationA,receipt);assert.equal(dataset.assessment,null);assert.equal(dataset.progress.completedHumanComparisons,0);
 const draft=validateDraft({version:1,layout:'single',settings:[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}],files:[null,null],result});
 assert.deepEqual((await readDraftBackup(new Uint8Array(await(await createDraftBackup(draft)).arrayBuffer()))).result.validationA,receipt);
 for(const changed of [{...input,title:'別の動画'},{...input,composition:'text_top'},{...input,imageDataUrl:dataUrl(png(1280,720,[1,2,3,255]))},{...input,feedback:{}}])await assert.rejects(()=>createEntry(changed,result),/照合結果/);
 await assert.rejects(()=>createEntry(input,{...result,validationA:undefined},{expectedValidationACase:fixed.caseId}),/照合結果/);
 await assert.rejects(()=>createEntry(input,result,{expectedValidationACase:'validation-a-'+'0'.repeat(64)}),/照合結果/);
 const tampered=structuredClone(bundle);tampered.images[0].result.validationA.requestSha256='0'.repeat(64);await assert.rejects(()=>validateCompleteImport(tampered),/照合結果/);
 for(const key of ['caseId','requestSha256','sourceSha256','serviceSourceSha256'])await assert.rejects(()=>createEntry(input,{...result,validationA:{...receipt,[key]:[receipt[key]]}}),/照合結果/);
 const downgraded={...bundle,version:'complete-comparison-1.9.0'};await assert.rejects(()=>validateCompleteImport(downgraded),/比較形式1.10.0/);
 const old={...result};delete old.validationA;assert.equal((await createEntry(input,old)).image.result.validationA,undefined);
});

test('attempt metadata distinguishes image-receive and whole-attempt time, preserves PNG identity and leaves cost and human time unknown',async()=>{
 const resultPng=png(),record=validateAttempt({version:1,id:'first-output',startedAt:'2026-10-25T00:00:00Z',finishedAt:'2026-10-25T00:00:02Z',status:'success',title:'人工タイトル',projectName:'人工案件',elapsedMs:2000,imageElapsedMs:1200,imageReturned:true,costUsd:null,generationVersion:COMPLETE_GENERATION_VERSION,imageSha256:hash(resultPng),error:null,parentImageId:null});
 assert.equal(record.imageElapsedMs,1200);assert.equal(record.elapsedMs,2000);assert.equal(record.costUsd,null);assert.equal(record.humanWorkflowElapsedMs,undefined);
 assert.throws(()=>validateAttempt({...record,imageElapsedMs:2001}),/受信時間/);assert.throws(()=>validateAttempt({...record,imageSha256:'invented'}),/ハッシュ/);
 const document={createElement:()=>({children:[],textContent:'',append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},setAttribute(){},addEventListener(){}})};let exported;
 const history=createAttemptHistory({root:document.createElement('section'),document,storage:{load:async()=>[record],put:()=>assert.fail('Export must be read-only')},download:(name,value)=>{exported=JSON.parse(value);}});
 await history.exportJson();assert.equal(exported.version,'complete-generation-attempts-1.1.0');assert.equal(exported.records[0].imageSha256,hash(resultPng));assert.equal(exported.summary.costUsd,null);assert.doesNotMatch(JSON.stringify(exported),/data:image|imageDataUrl/);
});
