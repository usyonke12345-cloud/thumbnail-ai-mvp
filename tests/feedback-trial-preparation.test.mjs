import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir,mkdtemp,rm,access} from 'node:fs/promises';
import {resolve,join,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {buildGenerationFeedback} from '../frontend/feedback-memory.js';
import {createEntry,comparisonBundle} from '../frontend/complete-gallery-model.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {prepareFeedbackTrials} from '../backend/analysis/feedback-trials.mjs';
import {bundle,png,dataUrl} from './helpers/complete-png.mjs';

const current={generationVersion:'ai-complete-0.10.2'};
const context={version:'thumbnail-reference-context-1.0.0',status:'supplied',reason:'matched',librarySha256:'a'.repeat(64),
 selectionMethod:'content_tags_then_image_model',candidates:[{videoId:'abcdefghijk',thumbnailSha256:'b'.repeat(64),observationSha256:'c'.repeat(64),imageSent:false}]};
async function fixture({version=current.generationVersion,referenceMode='off',referenceContext}={}){
 const dev=await bundle({title:'Calm trip'}),hold=await bundle({title:'Other project'});
 const feedback=await buildGenerationFeedback({groups:[dev.group],images:dev.images,reviews:[dev.review]}, {}, {enabled:true,scope:'all',reviewerId:'r01',excluded:[]});
 const images=[];
 for(const [id,color,memory]of [['control',[40,50,60,255],false],['treatment',[80,90,100,255],true]]){
  const entry=await createEntry({...hold.group.input,imageDataUrl:hold.group.sourceImageDataUrl,referenceMode,...(memory?{feedback}:{})},
   {imageDataUrl:dataUrl(png(1536,864,color)),generation_version:version,...(memory?{feedbackApplied:feedback}:{}),...(referenceContext?{referenceContext}:{})},
   {id,capturedAt:'2026-10-15T00:00:00.000Z'});
  images.push(entry.image);
 }
 const assets=new Map(),analyzer=createCompleteReviewAnalysis({async onAsset(asset,bytes){assets.set(asset.path,bytes);}});
 await analyzer.consume(comparisonBundle({groups:[hold.group],images,reviews:[]},hold.group.id));
 return {data:analyzer.finish(),assets};
}

test('B preparation explicitly selects a known current version while the legacy default remains frozen',async()=>{
 const {data}=await fixture(),before=JSON.stringify(data);
 assert.equal(prepareFeedbackTrials(data,'r01').pairs.length,0);
 const plan=prepareFeedbackTrials(data,'r01',current);assert.equal(plan.pairs.length,1);
 assert.equal(plan.version,'feedback-blind-trials-1.1.0');assert.equal(plan.generationVersion,current.generationVersion);
 assert.equal(new Set(plan.pairs[0].images.map(x=>x.feedbackUsed)).size,2);
 assert.equal(JSON.stringify(data),before);
 const old=await fixture({version:'ai-complete-0.6.1'}),legacy=prepareFeedbackTrials(old.data,'r01');
 assert.equal(legacy.pairs.length,1);assert.equal(legacy.version,'feedback-blind-trials-1.0.0');
 for(const generationVersion of ['ai-complete-0.6.0','ai-complete-0.5.2','ai-complete-0.7.1','ai-complete-0.13.0',''])
  assert.throws(()=>prepareFeedbackTrials(data,'r01',{generationVersion}),/生成版/);
});

test('B pairs require matching recorded reference conditions and exclude missing or malformed auto records',async()=>{
 const {data}=await fixture({referenceMode:'auto',referenceContext:context});
 // Normalization compares the content, independently of object property insertion order.
 data.images[1].result.referenceContext=Object.fromEntries(Object.entries(context).reverse());
 const plan=prepareFeedbackTrials(data,'r01',current);assert.equal(plan.pairs.length,1);
 for(const change of [
  d=>{d.images[1].referenceMode='off';delete d.images[1].result.referenceContext;},
  d=>d.images[1].result.referenceContext.librarySha256='d'.repeat(64),
  d=>d.images[1].result.referenceContext.candidates[0].observationSha256='e'.repeat(64),
  d=>d.images[1].result.referenceContext.candidates[0].imageSent=true,
  d=>{for(const x of d.images)delete x.result.referenceContext;},
  d=>d.images[1].result.referenceContext.status='invalid'
 ]){const changed=structuredClone(data);change(changed);assert.equal(prepareFeedbackTrials(changed,'r01',current).pairs.length,0);}
});

test('current B comparisons exclude unreadable or mismatched source PNGs, output failures, version mixing and holdout exposure',async()=>{
 const {data}=await fixture();
 for(const change of [
  d=>d.assets.find(a=>a.assetId===d.groups[0].sourcePhotoAssetId).diagnostic.status='unavailable',
  d=>d.assets.find(a=>a.assetId===d.groups[0].sourcePhotoAssetId).sha256='f'.repeat(64),
  d=>d.assets.find(a=>a.assetId===d.images[1].assetId).diagnostic.status='unavailable',
  d=>d.images[1].result.generation_version='ai-complete-0.10.1',
  d=>d.images[1].revision={instruction:'changed'},
  d=>d.images[1].feedbackContext.records[0].groupId=d.groups[0].id
 ]){const changed=structuredClone(data);change(changed);assert.equal(prepareFeedbackTrials(changed,'r01',current).pairs.length,0);}
 const original=prepareFeedbackTrials(data,'r01',current),later=structuredClone(data);
 later.images.push({...structuredClone(later.images[1]),id:'later',capturedAt:'2026-10-16T00:00:00.000Z'});
 assert.deepEqual(prepareFeedbackTrials(later,'r01',current).pairs,original.pairs);
});

test('offline B command writes blinded sheets for the selected version and preserves even a partly existing output directory',async()=>{
 const privateRoot=fileURLToPath(new URL('../data/private/',import.meta.url));await mkdir(privateRoot,{recursive:true});
 const dir=await mkdtemp(join(privateRoot,'feedback-trial-test-'));
 try{
  const input=join(dir,'input'),output=join(dir,'new-output'),partial=join(dir,'partial-output');
  await mkdir(join(input,'assets'),{recursive:true});const {data,assets}=await fixture({referenceMode:'auto',referenceContext:context});
  await writeFile(join(input,'analysis.json'),JSON.stringify(data));for(const [name,bytes]of assets)await writeFile(join(input,name),bytes);
  const script=fileURLToPath(new URL('../scripts/prepare-feedback-trials.mjs',import.meta.url));
  const run=out=>execFileSync(process.execPath,[script,input,'r01',out,'--generation-version',current.generationVersion],{encoding:'utf8',stdio:'pipe',env:{...process.env,OPENAI_IMAGE_ENABLED:'false',GENERATION_PROVIDER:'mock'}});
  const result=JSON.parse(run(output));assert.equal(result.pairs,1);assert.equal(result.generatedImages,0);assert.equal(result.generationVersion,current.generationVersion);
  const key=JSON.parse(await readFile(join(output,'private-answer-key.json'),'utf8'));assert.equal(key.generationVersion,current.generationVersion);
  for(const name of ['photo-review.html','photo-review.csv','pair-choices.csv']){
   const text=await readFile(join(output,name),'utf8');assert.doesNotMatch(text,/ai-complete|feedbackUsed|feedbackContext|control|treatment|complete-/);
  }
  const before=new Map();for(const name of await readdir(output))before.set(name,await readFile(join(output,name)));
  assert.throws(()=>run(output));for(const [name,bytes]of before)assert.deepEqual(await readFile(join(output,name)),bytes);
  await mkdir(partial);const answers=Buffer.from('Artificial saved reviewer answers\n');await writeFile(join(partial,'photo-review.csv'),answers);
  assert.throws(()=>run(partial));assert.deepEqual(await readdir(partial),['photo-review.csv']);assert.deepEqual(await readFile(join(partial,'photo-review.csv')),answers);
  // Corrupt input assets fail before an output directory is reserved.
  await writeFile(join(input,[...assets.keys()][0]),'corrupt synthetic PNG');
  const badOutput=join(dir,'bad-assets');assert.throws(()=>run(badOutput));await assert.rejects(()=>access(badOutput));
 }finally{
  assert.ok(resolve(dir).startsWith(resolve(privateRoot)+sep));assert.ok(basename(dir).startsWith('feedback-trial-test-'));
  await rm(dir,{recursive:true,force:true});
 }
});
