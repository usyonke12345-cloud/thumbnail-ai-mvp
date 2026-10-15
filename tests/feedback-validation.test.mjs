import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {splitFor as partnerSplit,parseCsv} from '../data/validate.mjs';
import {reviewItems,sheetHtml,sheetCsv} from '../data/complete-review-sheet.mjs';
import {splitForId,splitFromDigest} from '../shared/evaluation-split.mjs';
import {buildGenerationFeedback,createFeedbackMemory} from '../frontend/feedback-memory.js';
import {validateComplete,generateComplete} from '../backend/generation/complete.mjs';
import {normalizeGenerationFeedback,normalizeFeedbackSettings} from '../shared/generation-feedback.mjs';
import {feedbackExposure,feedbackUsage} from '../backend/analysis/feedback-audit.mjs';
import {prepareFeedbackTrials,trialItems,publicTrialItems,trialCsv} from '../backend/analysis/feedback-trials.mjs';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {createEntry,comparisonBundle} from '../frontend/complete-gallery-model.js';
import {bundle,png,dataUrl} from './helpers/complete-png.mjs';
const options={enabled:true,scope:'all',reviewerId:'r01',excluded:[]};
const stateOf=b=>({groups:[b.group],images:b.images,reviews:[b.review]});
async function cases(){const dev=await bundle({title:'Calm trip'}),hold=await bundle({title:'Other project'});assert.equal(partnerSplit(dev.group.id),'dev');assert.equal(partnerSplit(hold.group.id),'holdout');return {dev,hold};}
test('browser and server split agree exactly with partner SHA-256 sample splitting, including the prefix and 77 boundary',async()=>{
 for(const id of ['s001','s002',...Array.from({length:60},(_,i)=>'complete-'+i.toString(16).padStart(64,'0'))])assert.equal(await splitForId(id),partnerSplit(id));assert.equal(splitFromDigest([76]),'holdout');assert.equal(splitFromDigest([77]),'dev');
});
test('holdout reviews never enter the memory, even with all projects enabled, while old snapshots remain intact',async()=>{
 const {dev,hold}=await cases(),state={groups:[dev.group,hold.group],images:[...dev.images,...hold.images],reviews:[dev.review,hold.review]},memory=await buildGenerationFeedback(state,{},options);assert.equal(memory.records.length,1);assert.equal(memory.records[0].groupId,dev.group.id);
 assert.equal(await buildGenerationFeedback(stateOf(hold),{},options),null);
 const legacy={...memory,records:[{...memory.records[0],groupId:hold.group.id}]};assert.deepEqual(normalizeGenerationFeedback(legacy),legacy);let calls=0;
 const input={title:'validation',headlineMode:'auto',consent:true,imageDataUrl:dev.group.sourceImageDataUrl,feedback:legacy};assert.throws(()=>validateComplete(input),e=>e.code==='INVALID_FEEDBACK'&&e.message.includes('holdout'));await assert.rejects(()=>generateComplete(input,{generate:async()=>{calls++;return dataUrl(png());}}),e=>e.code==='INVALID_FEEDBACK');assert.equal(calls,0);
 for(const reviewerId of ['rabc','r_01','R01','r1']){assert.throws(()=>normalizeGenerationFeedback({...memory,reviewerId}));assert.throws(()=>normalizeFeedbackSettings({...options,reviewerId}));}
});
async function dataset(){const {dev,hold}=await cases(),feedback=await buildGenerationFeedback(stateOf(dev),{},options),input={...hold.group.input,imageDataUrl:hold.group.sourceImageDataUrl},images=[];
 for(const [id,color,memory]of [['control',[40,50,60,255],false],['treatment',[80,90,100,255],true]]){const entry=await createEntry({...input,...(memory?{feedback}:{})},{imageDataUrl:dataUrl(png(1536,864,color)),generation_version:'ai-complete-0.6.1',...(memory?{feedbackApplied:feedback}:{})},{id,capturedAt:'2026-10-15T00:00:00.000Z'});images.push(entry.image);}
 const b=comparisonBundle({groups:[hold.group],images,reviews:[]},hold.group.id),analysis=createCompleteReviewAnalysis();await analysis.consume(b);return {data:analysis.finish(),feedback,dev,hold};}
test('analysis emits usage flags and fixed splits, and audits previously exposed holdout without changing the old snapshots',async()=>{
 const {data,feedback,hold}=await dataset();assert.equal(data.version,'complete-evaluation-dataset-1.7.0');assert.equal(data.groups[0].split,'holdout');assert.deepEqual(data.images.map(x=>x.feedbackUsed),[false,true]);assert.deepEqual(data.feedbackSummary,{used:1,notUsed:1,unknown:0});assert.equal(data.assessment,null);
 assert.deepEqual(feedbackUsage({result:{generation_version:null}}),{feedbackUsed:false,feedbackUsageKnown:false});
 const historical=structuredClone(data.images[1]);historical.feedbackContext.records[0].groupId=hold.group.id;historical.result.feedbackApplied=historical.feedbackContext;const frozen=JSON.stringify(historical),audit=feedbackExposure([historical]);assert.deepEqual(audit.contaminatedGroupIds,[hold.group.id]);assert.equal(audit.holdoutExposures.length,1);assert.equal(JSON.stringify(historical),frozen);
 const legacy=await bundle();legacy.images[0].feedbackContext={...feedback,records:[{...feedback.records[0],groupId:hold.group.id}]};legacy.images[0].result.feedbackApplied=legacy.images[0].feedbackContext;legacy.version='complete-comparison-1.8.0';const analysis=createCompleteReviewAnalysis();await analysis.consume(legacy);assert.deepEqual(analysis.finish().feedbackAudit.contaminatedGroupIds,[hold.group.id]);
});
test('blind comparison uses one same-input holdout pair and excludes different versions, layout changes, revisions and historical leakage',async()=>{
 const {data}=await dataset(),plan=prepareFeedbackTrials(data,'r01');assert.equal(plan.pairs.length,1);assert.equal(new Set(plan.pairs[0].images.map(x=>x.feedbackUsed)).size,2);assert.deepEqual(prepareFeedbackTrials(data,'r01'),plan);
 for(const change of [d=>d.images[1].result.generation_version='ai-complete-0.6.0',d=>d.images[1].composition='text_top',d=>d.images[1].design='impact',d=>d.images[1].revision={instruction:'changed'},d=>d.images[1].feedbackContext.records[0].groupId=d.groups[0].id]){const changed=structuredClone(data);change(changed);assert.equal(prepareFeedbackTrials(changed,'r01').pairs.length,0);}
 const items=trialItems(data,plan,reviewItems),publicItems=publicTrialItems(plan,items),html=sheetHtml(publicItems,'r01',()=>dataUrl(png(1,1)));assert.doesNotMatch(html,/feedbackUsed|feedbackContext|ai-complete|Artificial record/);assert.doesNotMatch(sheetCsv(publicItems,'r01'),/control|treatment|complete-/);const csv=parseCsv(trialCsv(plan,items));assert.equal(csv.length,1);assert.equal(csv[0].preferred,'');assert.equal(csv[0].reason,'');assert.notEqual(csv[0].item_a,csv[0].item_b);
 const next=structuredClone(data);next.images.push({...next.images[1],id:'later',capturedAt:'2026-10-16T00:00:00.000Z'});assert.deepEqual(prepareFeedbackTrials(next,'r01').pairs,plan.pairs);
});
test('sending reasons to OpenAI is disclosed before generation and IDs match the partner schema',async()=>{
 const js=await readFile(new URL('../frontend/feedback-memory.js',import.meta.url),'utf8');assert.match(js,/評価理由もOpenAIへ送ります/);assert.match(js,/第三者の名前・連絡先/);
 const spec=JSON.parse(await readFile(new URL('../shared/openapi.json',import.meta.url),'utf8'));assert.equal(spec.components.schemas.GenerationFeedback.properties.reviewerId.pattern,'^r[0-9]{2,}$');
});
