import test from 'node:test';
import assert from 'node:assert/strict';
import {createEntry,addToGallery,comparisonBundle} from '../frontend/complete-gallery-model.js';
import {validateCompleteBundle,diagnosticRequest} from '../frontend/complete-png-transfer.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {png,dataUrl,bundle} from './helpers/complete-png.mjs';

async function automaticBundle(){
 let state={groups:[],images:[],reviews:[]};
 for(const [i,design]of ['photo_focus','editorial'].entries()){
  const entry=await createEntry({title:'A quiet weekend',brief:'A walk beside the sea',headline:null,headlineMode:'auto',design,composition:'auto',imageDataUrl:dataUrl(png(1280,720))},{width:1536,height:864,imageDataUrl:dataUrl(png(1536,864,[40+i*40,80,120,255])),generation_version:'ai-complete-0.2.0',limitations:['Synthetic test, wording unknown']},{id:'auto-'+i,capturedAt:'2026-10-10T00:00:00.000Z',elapsedMs:2000});
  state=addToGallery(state,entry);
 }
 return comparisonBundle(state,state.groups[0].id);
}

test('automatic headline and requested designs survive export, diagnostics and reanalysis without fabricated rendered text',async()=>{
 const exported=await automaticBundle(),normalized=await validateCompleteBundle(exported);
 assert.equal(normalized.version,'complete-comparison-1.3.0');
 assert.equal(normalized.group.input.headlineMode,'auto');assert.equal(normalized.group.input.headline,null);
 assert.deepEqual(normalized.images.map(x=>x.design),['photo_focus','editorial']);
 const request=await diagnosticRequest(normalized);
 assert.equal(request.assets.filter(x=>x.role==='source_photo').length,1);
 assert.ok(request.images.every(x=>x.headlineProvided===null&&x.renderedTextVerified===false&&x.textRegions===null));
 const analysis=createCompleteReviewAnalysis();await analysis.consume(exported);await analysis.consume(normalized);
 const data=analysis.finish();
 assert.equal(data.version,'complete-evaluation-dataset-1.1.0');assert.equal(data.images.length,2);
 assert.equal(data.progress.completedHumanComparisons,0);assert.equal(data.scoringAgreement,null);
 assert.equal(data.groups[0].input.headline,null);
 const html=completePreview(data);
 assert.ok(html.includes('AIに任せる（実際の文言は未取得）'));
 assert.ok(html.includes('写真を主役にする')&&html.includes('落ち着いた誌面風'));
 assert.ok(!html.includes('指定見出し：未記録'));
});

test('changed automatic policy, declared design or old format cannot silently change frozen inputs',async()=>{
 const exported=await automaticBundle();
 for(const mutate of [
  x=>x.version='complete-comparison-1.2.0',
  x=>x.group.input.headlineMode='manual',
  x=>x.group.input.headline='invented transcript',
  x=>x.images[0].design='invalid',
  x=>x.group.input.title='changed',
  x=>x.group.input.sourceSha256='0'.repeat(64)
 ]){
  const changed=structuredClone(exported);mutate(changed);
  await assert.rejects(()=>validateCompleteBundle(changed));
 }
 const legacy=await bundle();assert.equal((await validateCompleteBundle(legacy)).version,'complete-comparison-1.2.0');
 const analysis=createCompleteReviewAnalysis();await analysis.consume(legacy);
 assert.equal(analysis.finish().version,'complete-evaluation-dataset-1.0.0');
});
