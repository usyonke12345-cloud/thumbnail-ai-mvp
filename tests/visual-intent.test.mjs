import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeVisualIntent,COMPLETE_MOOD_EXAMPLES,COMPLETE_PATTERN_SEEDS} from '../shared/complete-designs.mjs';
import {validateComplete} from '../backend/generation/complete.mjs';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {createEditorDesignGuide} from '../frontend/editor-design-guide.js';
import {validateDraft} from '../frontend/editor-draft.js';
import {createEntry,addToGallery,comparisonBundle} from '../frontend/complete-gallery-model.js';
import {validateCompleteBundle,validateCompleteImport,diagnosticRequest} from '../frontend/complete-png-transfer.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';
const photo=png(1280,720),input={title:'A day outside',brief:'A slow walk around the town',headlineMode:'auto',headline:null,design:'auto',composition:'auto',imageDataUrl:dataUrl(photo),consent:true},output={imageDataUrl:dataUrl(png(1536,864)),generation_version:'ai-complete-0.4.0',limitations:['Synthetic test only; actual text and layout are unknown.']};

test('optional atmosphere has bounded Unicode text and blank values preserve legacy group identity',async()=>{
 assert.equal(normalizeVisualIntent(undefined),'');assert.equal(normalizeVisualIntent('  quiet  '),'quiet');
 assert.equal(normalizeVisualIntent('😀'.repeat(300)).length,600);assert.equal(validateComplete({...input,visualIntent:'  quiet  '}).visualIntent,'quiet');
 for(const value of [null,3,{},[],true,'x'.repeat(301),'bad\u0000input','bad\tinput'])assert.throws(()=>validateComplete({...input,visualIntent:value}),e=>e.code==='INVALID_INPUT');
 const old=await createEntry(input,output),blank=await createEntry({...input,visualIntent:' \n '},output),quiet=await createEntry({...input,visualIntent:'quiet'},output),padded=await createEntry({...input,visualIntent:' quiet '},output),bright=await createEntry({...input,visualIntent:'bright'},output);
 assert.equal(blank.group.id,old.group.id);assert.equal(blank.group.input.visualIntent,undefined);assert.equal(quiet.group.id,padded.group.id);assert.notEqual(quiet.group.id,old.group.id);assert.notEqual(quiet.group.id,bright.group.id);
});

test('atmosphere and optional pattern ideas reach a single edit with the original photograph and bounded cost settings',async()=>{
 assert.equal(COMPLETE_PATTERN_SEEDS.length,8);assert.equal(new Set(COMPLETE_PATTERN_SEEDS.map(x=>x.id)).size,8);assert.ok(COMPLETE_PATTERN_SEEDS.every(x=>x.status==='experimental'));
 assert.equal(new Set(COMPLETE_PATTERN_SEEDS.map(x=>x.typography)).size,8);assert.equal(new Set(COMPLETE_PATTERN_SEEDS.map(x=>x.layout)).size,8);
 const validated=validateComplete({...input,visualIntent:'落ち着いた旅。写真を自然に、文字を穏やかに。'}),prompt=completePrompt(validated);
 assert.match(prompt,/DESIRED ATMOSPHERE/);assert.ok(prompt.includes(JSON.stringify(validated.visualIntent)));assert.match(prompt,/not proven high-performing templates/);assert.match(prompt,/not new facts or permission/);assert.match(prompt,/Do not render the atmosphere notes/);assert.match(prompt,/Do not isolate or reposition a person/);
 let calls=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'fake-test-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{
  calls++;assert.match(url,/images\/edits$/);assert.deepEqual(Buffer.from(await body.get('image[]').arrayBuffer()),photo);assert.equal(body.get('prompt'),prompt);assert.equal(body.get('n'),'1');assert.equal(body.get('quality'),'medium');assert.equal(body.get('size'),'1536x864');assert.equal(body.get('model'),'gpt-image-2.5-flare');return new Response(JSON.stringify({data:[{b64_json:png(1536,864).toString('base64')}]}));
 }});
 await provider(validated);await assert.rejects(()=>provider(validated),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
 const fixed=completePrompt(validateComplete({...input,visualIntent:'柔らかい感じ',design:'editorial',composition:'text_right'}));assert.match(fixed,/DESIGN RECIPE: editorial/);assert.match(fixed,/right-headline composition/);assert.ok(!fixed.includes('PATTERN IDEAS:'));
});

test('free atmosphere examples select automatic art direction and retain editable text without generating or inventing a selection',()=>{
 const all=[],document={createElement(tag){const n={tag,children:[],textContent:'',value:'',attrs:{},events:{},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,v){this.events[k]=v;}};all.push(n);return n;}};
 const root=document.createElement('section'),intentControl=document.createElement('textarea'),designControl=document.createElement('select'),compositionControl=document.createElement('select');designControl.value='editorial';compositionControl.value='text_top';let saves=0;
 const guide=createEditorDesignGuide({root,document,intentControl,designControl,compositionControl,onSelect:()=>saves++});assert.equal(saves,0);
 for(const [i,example]of COMPLETE_MOOD_EXAMPLES.entries()){
  const button=all.find(x=>x.attrs['aria-label']===`${example.label}のイメージを入力`);assert.equal(button.type,'button');button.events.click();assert.equal(intentControl.value,example.text);assert.equal(designControl.value,'auto');assert.equal(compositionControl.value,'auto');assert.equal(saves,i+1);assert.equal(button.attrs['aria-pressed'],'true');
 }
 intentControl.value='自分で考えた雰囲気';intentControl.events.input();guide.render();assert.ok(all.find(x=>x.attrs.role==='status').textContent.includes(intentControl.value));assert.ok(all.filter(x=>x.attrs['aria-label']?.endsWith('のイメージを入力')).every(x=>x.attrs['aria-pressed']==='false'));assert.equal(saves,8);
});

test('atmosphere draft survives reload; old drafts remain usable and never retain paid authorization',()=>{
 const draft={version:1,layout:'single',settings:[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}],files:[null,null],visualIntent:'  落ち着いた旅  ',consent:true,apiKey:'never-save'};
 const saved=validateDraft(draft);assert.equal(saved.visualIntent,'落ち着いた旅');assert.equal(saved.consent,undefined);assert.equal(saved.apiKey,undefined);const {visualIntent,...old}=draft;assert.equal(validateDraft(old).visualIntent,'');assert.throws(()=>validateDraft({...draft,visualIntent:'x'.repeat(301)}));
});

test('versioned mood records survive import and private analysis without fabricating text regions, human comparisons or approved patterns',async()=>{
 const entry=await createEntry({...input,visualIntent:'落ち着いた旅。<script>untrusted text</script>'},output,{id:'mood-01'}),state=addToGallery({groups:[],images:[],reviews:[]},entry),exported=comparisonBundle(state,entry.group.id),normalized=await validateCompleteBundle(exported);
 assert.equal(exported.version,'complete-comparison-1.4.0');assert.equal(normalized.group.input.visualIntent,entry.group.input.visualIntent);assert.equal(normalized.images[0].design,'auto');assert.equal((await validateCompleteImport(normalized))[0].group.id,entry.group.id);
 const request=await diagnosticRequest(normalized);assert.equal(request.assetVersion,'image-assets-1.0.0');assert.equal(request.images[0].textRegions,null);assert.equal(request.images[0].renderedTextVerified,false);
 for(const mutate of [x=>x.group.input.visualIntent='bright',x=>x.version='complete-comparison-1.3.0',x=>x.group.input.visualIntent='x'.repeat(301)]){const invalid=structuredClone(exported);mutate(invalid);await assert.rejects(()=>validateCompleteBundle(invalid));}
 const analysis=createCompleteReviewAnalysis();await analysis.consume(normalized);const data=analysis.finish();assert.equal(data.version,'complete-evaluation-dataset-1.2.0');assert.equal(data.progress.completedHumanComparisons,0);assert.equal(data.assessment,null);assert.equal(data.scoringAgreement,null);
 const html=completePreview(data);assert.ok(html.includes('仕上がりのイメージ'));assert.ok(html.includes('&lt;script&gt;untrusted text&lt;/script&gt;'));assert.ok(!html.includes('<script>untrusted text</script>'));
});

test('editor offers atmosphere before optional manual design controls and persists it through the paid handler',async()=>{
 const html=await readFile(new URL('../frontend/editor.html',import.meta.url),'utf8'),editor=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8');assert.ok(html.indexOf('id="ai-visual-intent"')<html.indexOf('id="ai-advanced-design"'));assert.match(html,/<details id="ai-advanced-design"><summary>/);assert.match(html,/仕上がりのイメージ・見出しの指定をOpenAI/);
 assert.match(editor,/visualIntent:document\.querySelector\('#ai-visual-intent'\)\.value/);assert.match(editor,/value=draft\.visualIntent/);assert.ok(editor.includes("['#ai-title','#ai-brief','#ai-visual-intent']"));
});
