import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {validateComplete} from '../backend/generation/complete.mjs';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {createEntry,addToGallery,comparisonBundle} from '../frontend/complete-gallery-model.js';
import {validateCompleteBundle,validateCompleteImport} from '../frontend/complete-png-transfer.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';
const photo=png(1280,720),input={title:'A quiet day outside',headlineMode:'auto',imageDataUrl:dataUrl(photo),consent:true};
const result={imageDataUrl:dataUrl(png(1536,864)),generation_version:'ai-complete-0.4.2',limitations:['Synthetic test, not a paid output.']};

test('title-only input normalizes optional notes and makes one photograph edit without invented context or an extra text API',async()=>{
 const normalized=validateComplete(input);assert.equal(normalized.brief,'');assert.equal(normalized.headline,null);
 for(const brief of ['', ' \n ',undefined])assert.equal(validateComplete({...input,brief}).brief,'');
 for(const brief of [null,42,{},'x'.repeat(1001),'bad\u0000notes'])assert.throws(()=>validateComplete({...input,brief}),e=>e.code==='INVALID_INPUT');
 assert.throws(()=>validateComplete({...input,title:''}));assert.throws(()=>validateComplete({...input,headlineMode:'manual'}));
 const manual=validateComplete({...input,headlineMode:'manual',headline:'MY WALK'});assert.equal(manual.headline,'MY WALK');assert.equal(manual.brief,'');
 const prompt=completePrompt(normalized);assert.match(prompt,/only stated content context/);assert.match(prompt,/without inventing missing video details/);assert.match(prompt,/Choose one short thumbnail headline/);assert.ok(prompt.includes('"brief":""'));
 let calls=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'fake-title-only-test',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{
  calls++;assert.match(url,/images\/edits$/);assert.equal(body.get('prompt'),prompt);assert.deepEqual(Buffer.from(await body.get('image[]').arrayBuffer()),photo);assert.equal(body.get('n'),'1');assert.equal(body.get('quality'),'medium');
  return new Response(JSON.stringify({data:[{b64_json:png(1536,864).toString('base64')}]}));
 }});
 await provider(normalized);await assert.rejects(()=>provider(normalized),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
});

test('title-only output can be archived, exported and imported with honest input identity and no fabricated comparison',async()=>{
 const a=await createEntry(input,result),b=await createEntry({...input,brief:''},result),white=await createEntry({...input,brief:' \n '},result),withNotes=await createEntry({...input,brief:'A walk by the river'},result);
 assert.equal(a.group.input.brief,'');assert.equal(a.group.id,b.group.id);assert.equal(a.group.id,white.group.id);assert.notEqual(a.group.id,withNotes.group.id);
 const state=addToGallery({groups:[],images:[],reviews:[]},a),bundle=comparisonBundle(state,a.group.id);assert.equal(bundle.version,'complete-comparison-1.5.0');assert.equal(bundle.review,null);assert.equal(bundle.assessment,null);
 const imported=await validateCompleteBundle(bundle);assert.equal(imported.group.id,bundle.group.id);assert.equal((await validateCompleteImport(imported))[0].group.input.brief,'');
 for(const version of ['complete-comparison-1.0.0','complete-comparison-1.3.0','complete-comparison-1.4.0'])await assert.rejects(()=>validateCompleteBundle({...bundle,version}));
 const invalid=structuredClone(bundle);invalid.group.input.brief='Invented missing notes';await assert.rejects(()=>validateCompleteBundle(invalid));
 const mood=await createEntry({...input,visualIntent:'自然に'},result),moodBundle=comparisonBundle(addToGallery({groups:[],images:[],reviews:[]},mood),mood.group.id);assert.equal((await validateCompleteBundle(moodBundle)).version,'complete-comparison-1.5.0');
 const analysis=createCompleteReviewAnalysis();await analysis.consume(bundle);const data=analysis.finish();assert.equal(data.version,'complete-evaluation-dataset-1.7.0');assert.equal(data.progress.completedHumanComparisons,0);assert.equal(data.assessment,null);assert.match(completePreview(data),/補足なし（動画タイトルから判断）/);
});

test('headline input is optional and hidden by default, while explicitly restored manual wording remains visible',async()=>{
 const html=await readFile(new URL('../frontend/editor.html',import.meta.url),'utf8'),source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="ai-title"')<html.indexOf('id="headline"'));assert.match(html,/<details id="ai-advanced-headline">/);assert.match(html,/<div id="manual-headline-control" hidden>/);assert.match(html,/<textarea id="headline"[^>]*disabled><\/textarea>/);assert.ok(!html.includes('FIND YOUR'));assert.match(html,/写真と動画タイトルだけで生成/);
 const start=source.indexOf('function updateHeadlineControls()'),end=source.indexOf('const designGuide=',start),nodes={'#ai-headline-mode':{value:'auto'},'#manual-headline-control':{},'#ai-advanced-headline':{open:false},'#headline-mode-description':{}},headline={value:'Restored manual wording',disabled:false};
 const scope={document:{querySelector:id=>nodes[id]},headline};vm.runInNewContext(source.slice(start,end),scope);scope.updateHeadlineControls();assert.equal(headline.disabled,true);assert.equal(nodes['#manual-headline-control'].hidden,true);assert.equal(headline.value,'Restored manual wording');
 nodes['#ai-headline-mode'].value='manual';scope.updateHeadlineControls();assert.equal(headline.disabled,false);assert.equal(nodes['#manual-headline-control'].hidden,false);assert.equal(nodes['#ai-advanced-headline'].open,true);
 assert.match(source,/finally\{restoring=false;updateHeadlineControls\(\)/);assert.match(source,/addEventListener\('change',\(\)=>\{updateHeadlineControls\(\);scheduleDraft\(\);\}\)/);
});
