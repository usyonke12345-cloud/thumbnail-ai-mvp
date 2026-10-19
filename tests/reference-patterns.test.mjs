import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {COMPLETE_REFERENCE_PATTERNS,REFERENCE_PATTERN_LIBRARY_VERSION,completeReferencePatternInstructions} from '../backend/generation/complete-reference-patterns.mjs';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {generateComplete,validateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {freezeValidationA,checkValidationARequest} from '../backend/validation-a.mjs';
import {feedbackUsage} from '../backend/analysis/feedback-audit.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';

const photo=png(1280,720,[30,70,110,255]),finished=png();
const input={title:'人工タイトル：静かな街を歩き、初めての朝市で買い物をした日',brief:'',headlineMode:'auto',design:'auto',composition:'auto',visualIntent:'自然な写真、短く内容が伝わる文字',imageDataUrl:dataUrl(photo),consent:true};

test('single-photo reference bank offers conditional letterform and placement families without importing collages or reference content into the prompt',()=>{
 const prompt=completePrompt(validateComplete(input));
 assert.equal(COMPLETE_REFERENCE_PATTERNS.length,9);assert.equal(new Set(COMPLETE_REFERENCE_PATTERNS.map(x=>x.id)).size,9);
 for(const {id,sources,when,avoid} of COMPLETE_REFERENCE_PATTERNS){assert.ok(when&&avoid);assert.ok(prompt.includes(`"id":"${id}"`));for(const source of sources){assert.match(source,/^[A-Za-z0-9_-]{11}$/);assert.ok(!prompt.includes(source));}}
 assert.ok(prompt.includes(REFERENCE_PATTERN_LIBRARY_VERSION));assert.doesNotMatch(prompt,/https:\/\/|youtube\.com|collage_center|PATTERN IDEAS:|quiet_caption:/);
 assert.match(prompt,/compare two or three feasible candidates/);assert.match(prompt,/not through extra calls, a random rotation/);
 assert.match(prompt,/Neither a yellow key phrase nor a second text color is mandatory/);assert.match(prompt,/Do not flatten all families into bold Gothic/);
 assert.match(prompt,/do not manufacture space, add another photo, invent events or discard the meaningful headline/);
});

test('reference-guided generation sends the exact photograph once, keeps cost settings, reports the new version and never invents the selected pattern',async()=>{
 let calls=0;
 const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic-test-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{
  calls++;assert.match(url,/images\/edits$/);assert.equal(body.getAll('image[]').length,1);assert.deepEqual(Buffer.from(await body.get('image[]').arrayBuffer()),photo);
  for(const [key,value]of Object.entries({model:'gpt-image-2.5-flare',quality:'medium',size:'1536x864',n:'1',output_format:'png'}))assert.equal(body.get(key),value);
  assert.equal(body.get('prompt'),completePrompt(validateComplete(input)));
  return new Response(JSON.stringify({data:[{b64_json:finished.toString('base64')}]}));
 }});
 const result=await generateComplete(input,{generate:provider});assert.equal(calls,1);assert.equal(result.generation_version,COMPLETE_GENERATION_VERSION);
 assert.equal(result.selectedPattern,undefined);assert.equal(result.assessment,undefined);assert.equal(result.feedbackApplied,undefined);
 await assert.rejects(()=>generateComplete(input,{generate:provider}),error=>error.code==='GENERATION_LIMIT');assert.equal(calls,1);
});

test('explicit design, fixed placement and revisions do not receive competing reference layouts; manual copy still supports automatic art direction',()=>{
 for(const design of ['photo_focus','editorial','impact']){const prompt=completePrompt({...input,design});assert.match(prompt,new RegExp('DESIGN RECIPE: '+design));assert.doesNotMatch(prompt,/REFERENCE PATTERN LIBRARY/);}
 for(const [composition,label]of [['text_left','left-headline'],['text_right','right-headline'],['text_top','top-headline']]){const prompt=completePrompt({...input,composition});assert.ok(prompt.includes(label));assert.doesNotMatch(prompt,/REFERENCE PATTERN LIBRARY|"id":"lower_sentence"/);}
 const revision=completePrompt({...input,revision:{instruction:'文字だけ少し小さく',parentImageId:'synthetic-parent',imageDataUrl:dataUrl(finished)}});assert.match(revision,/preserve unrequested design features/);assert.doesNotMatch(revision,/REFERENCE PATTERN LIBRARY/);
 const headline='雨の朝\n市場へ行く',manual=completePrompt({...input,headlineMode:'manual',headline});assert.match(manual,/REFERENCE PATTERN LIBRARY/);assert.match(manual,/Render exactly the supplied headline/);assert.ok(manual.includes(JSON.stringify(headline)));assert.doesNotMatch(manual,/ARTIFICIAL EDITING EXAMPLES/);
 assert.equal(completeReferencePatternInstructions({design:'editorial'}),'');
});

test('A freeze records the pattern file hash and binds the library to the current generation; a prior-version ID is rejected before dispatch',async()=>{
 const {consent,...value}=input,fixed=await freezeValidationA(value),path='backend/generation/complete-reference-patterns.mjs';
 const file=fixed.service.files.find(x=>x.path===path);assert.ok(file);assert.equal(file.sha256,createHash('sha256').update(await readFile(new URL('../'+path,import.meta.url))).digest('hex'));
 assert.equal(fixed.service.generationVersion,COMPLETE_GENERATION_VERSION);assert.ok(fixed.servicePrompt.includes(REFERENCE_PATTERN_LIBRARY_VERSION));assert.doesNotMatch(fixed.chatgptPrompt,/REFERENCE PATTERN LIBRARY|lower_sentence/);
 const prior={...fixed.service,generationVersion:'ai-complete-0.7.0'},oldId='validation-a-'+createHash('sha256').update(JSON.stringify({requestSha256:fixed.requestSha256,service:prior,servicePromptSha256:fixed.servicePromptSha256})).digest('hex');
 await assert.rejects(()=>checkValidationARequest(input,oldId),error=>error.code==='VALIDATION_A_MISMATCH');
 assert.equal((await checkValidationARequest(input,fixed.caseId)).caseId,fixed.caseId);
});

test('analysis recognizes memory-free 0.8.0 outputs without assuming unknown future versions are memory-free',()=>{
 assert.deepEqual(feedbackUsage({result:{generation_version:'ai-complete-0.8.0'}}),{feedbackUsed:false,feedbackUsageKnown:true});
 assert.equal(feedbackUsage({result:{generation_version:'ai-complete-0.8.1'}}).feedbackUsageKnown,false);
});
