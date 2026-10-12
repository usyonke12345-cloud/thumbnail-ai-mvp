import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {bundle,png,dataUrl} from './helpers/complete-png.mjs';
import {createEntry,comparisonBundle,createLegacyEntry} from '../frontend/complete-gallery-model.js';
import {validateCompleteBundle,createCompleteShareZip} from '../frontend/complete-png-transfer.js';
import {readZip,comparisonFromZip} from '../frontend/local-archive.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {generateComplete,validateComplete} from '../backend/generation/complete.mjs';
import {validateDraft} from '../frontend/editor-draft.js';
import {MAX_COMPLETE_PNG_BYTES,MAX_COMPLETE_PNG_DATA_URL_LENGTH,isCompletePngDataUrl} from '../shared/complete-images.mjs';
import {MAX_INPUT_BYTES} from '../backend/scoring/png.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function revisionFixture(includeParent=false){
 const parent=await bundle({count:1,review:false}),{sourceSha256,...fields}=parent.group.input;
 const input={...fields,imageDataUrl:parent.group.sourceImageDataUrl,consent:true,revision:{instruction:'文字を穏やかに',parentImageId:parent.images[0].id,imageDataUrl:parent.images[0].result.imageDataUrl}};
 const result=await generateComplete(input,{generate:async()=>dataUrl(png(1536,864,[170,130,120,255]))});
 const entry=await createEntry(input,result,{id:'synthetic-revision'}),state={groups:[entry.group],images:[...(includeParent?parent.images:[]),entry.image],reviews:[]};
 return {parent,input,result,entry,bundle:comparisonBundle(state,entry.group.id)};
}
test('an absent revision parent is explicitly unverified, including old 1.6 exports and forged status claims',async()=>{
 const fixture=await revisionFixture(),value=fixture.bundle;
 assert.equal(value.revisionChecks[0].status,'unverified');assert.match(value.revisionChecks[0].reason,/修正元は未確認/);
 const old=structuredClone(value);delete old.revisionChecks;
 assert.deepEqual((await validateCompleteBundle(old)).revisionChecks,value.revisionChecks);
 const forged=structuredClone(value);forged.revisionChecks[0].status='verified';forged.revisionChecks[0].reason='Pretend the parent was checked';
 assert.deepEqual((await validateCompleteBundle(forged)).revisionChecks,value.revisionChecks);
 const unrelated=await bundle({count:1,review:false});assert.equal((await validateCompleteBundle(unrelated)).revisionChecks,undefined);
});
test('present revision parents must match both ID and PNG hash and cannot refer to the child itself',async()=>{
 const fixture=await revisionFixture(true),value=fixture.bundle,checked=await validateCompleteBundle(value);
 assert.equal(checked.revisionChecks[0].status,'verified');assert.equal(checked.revisionChecks[0].scope,'comparison_bundle');
 for(const change of [{parentImageSha256:'0'.repeat(64)},{parentImageId:'synthetic-revision',parentImageSha256:fixture.entry.image.imageSha256}]){
  const invalid=structuredClone(value),child=invalid.images.find(x=>x.id==='synthetic-revision');Object.assign(child.revision,change);Object.assign(child.result.revision,change);await assert.rejects(()=>validateCompleteBundle(invalid),/修正元/);
 }
 const wrongResponse=structuredClone(value);wrongResponse.images.at(-1).result.revision.parentImageId='different-parent';await assert.rejects(()=>validateCompleteBundle(wrongResponse),/生成応答/);
});
test('analysis can verify a parent supplied later without upgrading an absent parent or retaining image bytes',async()=>{
 const fixture=await revisionFixture(),analysis=createCompleteReviewAnalysis();await analysis.consume(fixture.bundle);
 let dataset=analysis.finish();assert.equal(dataset.revisionChecks[0].status,'unverified');assert.equal(dataset.revisionChecks[0].scope,'analysis_dataset');assert.match(dataset.limitations.join(' '),/修正元は未確認/);assert.match(completePreview(dataset),/修正元は未確認/);
 await analysis.consume(fixture.parent);dataset=analysis.finish();assert.equal(dataset.revisionChecks[0].status,'verified');assert.equal(dataset.images.length,2);assert.equal(dataset.images.find(x=>x.id==='synthetic-revision').result.revision.parentImageSha256,fixture.parent.images[0].imageSha256);assert.ok(!JSON.stringify(dataset).includes('base64'));assert.match(completePreview(dataset),/IDとSHA-256を確認/);
});
test('private ZIP preview and restored records expose unverified parents without trusting exported status',async()=>{
 const fixture=await revisionFixture(),report={version:'complete-comparison-report-1.1.0',kind:'human_quality_report',assessment:null,sets:[fixture.bundle],summary:{}};
 report.sets[0].revisionChecks[0].status='verified';const zip=await createCompleteShareZip(report),files=await readZip(new Uint8Array(await zip.blob.arrayBuffer()));
 const preview=new TextDecoder().decode(files.get('preview.html'));assert.match(preview,/修正元は未確認/);assert.ok(preview.includes(fixture.parent.images[0].imageSha256));
 const restored=await comparisonFromZip(new Uint8Array(await zip.blob.arrayBuffer()));assert.equal((await validateCompleteBundle(restored.sets[0])).revisionChecks[0].status,'unverified');
});
test('revision responses calculate the input PNG hash and retain it through drafts, comparison and legacy recovery',async()=>{
 const fixture=await revisionFixture(),expected={parentImageId:fixture.input.revision.parentImageId,parentImageSha256:sha(Buffer.from(fixture.input.revision.imageDataUrl.slice(22),'base64'))};
 assert.deepEqual(fixture.result.revision,expected);assert.deepEqual(fixture.entry.image.result.revision,expected);
 const draft=validateDraft({version:1,layout:'single',settings:[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}],files:[null,null],result:fixture.result});assert.deepEqual(draft.result.revision,expected);
 const entry=await createLegacyEntry(fixture.result,{id:'legacy-revision'}),legacy=comparisonBundle({groups:[entry.group],images:[entry.image],reviews:[]},entry.group.id);assert.equal(legacy.version,'complete-comparison-1.6.0');assert.equal((await validateCompleteBundle(legacy)).revisionChecks[0].status,'unverified');
 const normal=await generateComplete({...fixture.input,revision:undefined},{generate:async()=>fixture.result.imageDataUrl});assert.equal(normal.revision,undefined);
});
test('revision API and draft reject byte overflow even when base64 has the same maximum character count',async()=>{
 const fixture=await revisionFixture(),spec=JSON.parse(await readFile(new URL('../shared/openapi.json',import.meta.url),'utf8'));
 assert.equal(MAX_COMPLETE_PNG_BYTES,MAX_INPUT_BYTES);assert.equal(MAX_COMPLETE_PNG_DATA_URL_LENGTH,22369646);assert.equal(spec.paths['/api/v1/complete-thumbnail'].post.requestBody.content['application/json'].schema.properties.revision.properties.imageDataUrl.maxLength,MAX_COMPLETE_PNG_DATA_URL_LENGTH);assert.equal(spec.components.schemas.PngAsset.properties.dataUrl.maxLength,MAX_COMPLETE_PNG_DATA_URL_LENGTH);
 const header=png().subarray(0,24);let calls=0;
 for(const size of [MAX_COMPLETE_PNG_BYTES,MAX_COMPLETE_PNG_BYTES+1,MAX_COMPLETE_PNG_BYTES+2,MAX_COMPLETE_PNG_BYTES+3]){
  // Artificial header-only data isolates the byte limit; no provider or PNG diagnostic is called.
  const bytes=Buffer.alloc(size);header.copy(bytes);const imageDataUrl=dataUrl(bytes),input={...fixture.input,revision:{...fixture.input.revision,imageDataUrl}},draft={version:1,layout:'single',settings:[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}],files:[null,null],revision:input.revision};
  if(size===MAX_COMPLETE_PNG_BYTES){assert.equal(imageDataUrl.length,MAX_COMPLETE_PNG_DATA_URL_LENGTH);assert.equal(isCompletePngDataUrl(imageDataUrl),true);assert.equal(validateComplete(input).revision.imageDataUrl,imageDataUrl);assert.equal(validateDraft(draft).revision.imageDataUrl,imageDataUrl);}
  else{assert.equal(isCompletePngDataUrl(imageDataUrl),false);await assert.rejects(()=>generateComplete(input,{generate:async()=>{calls++;return fixture.result.imageDataUrl;}}),error=>error.code==='INVALID_REVISION');assert.throws(()=>validateDraft(draft),/16MiB/);}
 }
 assert.equal(calls,0);
});
