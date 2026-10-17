import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generateComplete,validateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {freezeValidationA} from '../backend/validation-a.mjs';
import {createEntry,comparisonBundle} from '../frontend/complete-gallery-model.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {prepareFeedbackTrials} from '../backend/analysis/feedback-trials.mjs';
import {feedbackUsage} from '../backend/analysis/feedback-audit.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';

const source=png(1280,720),finished=png(),input={title:'人工タイトル：雨の日にゆっくり街を歩く',headlineMode:'auto',imageDataUrl:dataUrl(source),consent:true};

test('new editorial direction reaches one unchanged photo edit and its version survives private export and diagnostics without a fabricated headline or quality score',async()=>{
 let calls=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'test-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{
  calls++;assert.match(url,/images\/edits$/);assert.deepEqual(Buffer.from(await body.get('image[]').arrayBuffer()),source);assert.equal(body.getAll('image[]').length,1);
  for(const [key,value]of Object.entries({model:'gpt-image-2.5-flare',quality:'medium',size:'1536x864',n:'1',output_format:'png'}))assert.equal(body.get(key),value);
  const prompt=body.get('prompt');assert.match(prompt,/HEADLINE EDITING/);assert.match(prompt,/one reason to watch/);assert.match(prompt,/language of the video title/);assert.match(prompt,/TYPESETTING BASELINE/);assert.match(prompt,/REFERENCE-DERIVED LAYOUT STUDIES/);assert.match(prompt,/same people, exact facial features/);assert.match(prompt,/Never render these example headlines/);assert.ok(prompt.includes(JSON.stringify(input.title)));assert.ok(prompt.length<30000);
  return new Response(JSON.stringify({data:[{b64_json:finished.toString('base64')}]}));
 }});
 const result=await generateComplete(input,{generate:provider});assert.equal(result.generation_version,'ai-complete-0.7.0');assert.equal(calls,1);
 await assert.rejects(()=>generateComplete(input,{generate:provider}),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
 const entry=await createEntry(input,result),bundle=comparisonBundle({groups:[entry.group],images:[entry.image],reviews:[]},entry.group.id),analysis=createCompleteReviewAnalysis();await analysis.consume(bundle);const data=analysis.finish();
 assert.equal(data.images[0].result.generation_version,COMPLETE_GENERATION_VERSION);assert.equal(data.images[0].feedbackUsed,false);assert.equal(data.images[0].feedbackUsageKnown,true);assert.equal(data.assessment,null);assert.equal(data.reviews.length,0);assert.equal(data.progress.completedHumanComparisons,0);assert.equal(data.groups[0].input.headline,null);
 assert.equal(prepareFeedbackTrials(data,'r01').pairs.length,0); // B is still frozen to its existing 0.6.1 protocol.
 assert.equal(feedbackUsage({result:{generation_version:'ai-complete-0.7.1'}}).feedbackUsageKnown,false);
});

test('manual copy and explicit placement exclude automatic copy examples and reference layout suggestions, including a revision with both source images',async()=>{
 const previous=png(),manual={...input,headlineMode:'manual',headline:'静かな朝\n雨を楽しむ',design:'editorial',composition:'text_right',revision:{instruction:'文字だけを少し小さく',parentImageId:'synthetic-parent',imageDataUrl:dataUrl(previous)}};
 let calls=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'test-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{
  calls++;const prompt=body.get('prompt');assert.match(prompt,/Render exactly the supplied headline/);assert.ok(prompt.includes(JSON.stringify(manual.headline)));assert.match(prompt,/right-headline composition/);assert.match(prompt,/DESIGN RECIPE: editorial/);assert.doesNotMatch(prompt,/ARTIFICIAL EDITING EXAMPLES|REFERENCE-DERIVED LAYOUT STUDIES|HEADLINE EDITING|TYPESETTING BASELINE/);
  const images=body.getAll('image[]');assert.equal(images.length,2);assert.deepEqual(Buffer.from(await images[0].arrayBuffer()),source);assert.deepEqual(Buffer.from(await images[1].arrayBuffer()),previous);
  return new Response(JSON.stringify({data:[{b64_json:finished.toString('base64')}]}));
 }});
 const result=await generateComplete(manual,{generate:provider});assert.equal(calls,1);assert.equal(result.revision.parentImageId,'synthetic-parent');assert.equal(result.feedbackApplied,undefined);
 // An auto type choice with explicit placement must not reintroduce alternate zones.
 const {completePrompt}=await import('../backend/generation/complete-prompt.mjs');const fixed=completePrompt(validateComplete({...input,composition:'text_top'}));assert.match(fixed,/top-headline composition/);assert.doesNotMatch(fixed,/REFERENCE-DERIVED LAYOUT STUDIES|UPPER FLANKS:|LOWER ANCHOR:/);
});

test('A freeze binds the new headline editing file and prompt to the running generation version without sending a paid request',async()=>{
 const {consent,...value}=input,fixed=await freezeValidationA(value),file=fixed.service.files.find(x=>x.path==='backend/generation/complete-editorial.mjs');assert.ok(file);assert.equal(file.sha256,createHash('sha256').update(await readFile(new URL('../backend/generation/complete-editorial.mjs',import.meta.url))).digest('hex'));
 assert.equal(fixed.service.generationVersion,COMPLETE_GENERATION_VERSION);assert.equal(fixed.service.feedbackUsed,false);assert.match(fixed.servicePrompt,/HEADLINE EDITING/);assert.equal(fixed.servicePromptSha256,createHash('sha256').update(fixed.servicePrompt).digest('hex'));
 assert.doesNotMatch(fixed.chatgptPrompt,/TYPESETTING BASELINE|REFERENCE-DERIVED/);
});
