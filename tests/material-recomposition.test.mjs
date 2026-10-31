import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {validateComplete,generateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {createEditorDesignGuide} from '../frontend/editor-design-guide.js';
import {createDraftBackup,readDraftBackup} from '../frontend/editor-backup.js';
import {createEntry,addToGallery,comparisonBundle,comparisonReport} from '../frontend/complete-gallery-model.js';
import {createCompleteShareZip,validateCompleteImport} from '../frontend/complete-png-transfer.js';
import {readComparisonFile} from '../frontend/local-archive.js';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {feedbackUsage} from '../backend/analysis/feedback-audit.mjs';
import {freezeValidationA} from '../backend/validation-a.mjs';
import {createHash} from 'node:crypto';
import {assertValidationAInput,validationACase} from '../frontend/validation-a.js';
import {makeServer} from '../backend/server.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';
const photo=png(1280,720),finished=png(1536,864),input={title:'海辺で過ごす休日',brief:'',headlineMode:'auto',headline:null,design:'recompose',composition:'auto',visualIntent:'自然で穏やかに',imageDataUrl:dataUrl(photo),consent:true};

test('recomposition is explicit opt-in; every existing design retains the photograph-preserving boundary',()=>{
 const normalized=validateComplete(input),prompt=completePrompt(normalized);
 assert.equal(normalized.design,'recompose');assert.match(prompt,/sole photographic source/);assert.match(prompt,/isolate, crop, scale and reposition existing/);assert.match(prompt,/exact facial features, expression, pose/);assert.match(prompt,/Do not repaint skin, change clothing/);assert.match(prompt,/Show each person once/);assert.match(prompt,/neutral graphic backdrop/);assert.match(prompt,/REQUIRED SPATIAL EDIT/);assert.match(prompt,/position or size relative to the backdrop/);assert.match(prompt,/A whole-photo crop, color change or text overlay alone does not satisfy/);assert.doesNotMatch(prompt,/REFERENCE PATTERN LIBRARY/);
 assert.doesNotMatch(prompt,/Do not isolate or reposition|whole-photo cropping only|Do not relocate the person|rather than moving the person|Keep the photographed scene and subject positions intact/);
 for(const design of [undefined,'auto','photo_focus','editorial','impact']){
  const preserved=validateComplete({...input,design});assert.equal(preserved.design,design??'auto');
  const original=completePrompt(preserved);assert.match(original,/Do not isolate or reposition a person, repaint skin/);assert.doesNotMatch(original,/ALLOWED CHANGES: isolate/);
 }
 assert.throws(()=>validateComplete({...input,design:'invented'}),error=>error.code==='INVALID_INPUT');
});

test('recomposed manual copy and fixed zones do not receive conflicting whole-photo or competing placement instructions',()=>{
 for(const [composition,zone]of [['text_left','on the left'],['text_right','on the right'],['text_top','above the source subject']]){
  const prompt=completePrompt(validateComplete({...input,headlineMode:'manual',headline:'海辺の休日',composition}));
  assert.ok(prompt.includes(zone));assert.match(prompt,/Render exactly the supplied headline/);assert.match(prompt,/海辺の休日/);
  assert.doesNotMatch(prompt,/whole-photo cropping only|REFERENCE PATTERN LIBRARY|ARTIFICIAL EDITING EXAMPLES/);
 }
});

test('one recomposition uses one photo edit and a revision uses the original plus the prior design, without extra calls or invented cutout metadata',async()=>{
 let requests=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic-test-key',OPENAI_IMAGE_ENABLED:'true',OPENAI_MAX_CALLS:'2'},fetchImpl:async(url,{body})=>{
  requests++;assert.match(url,/images\/edits$/);assert.equal(body.getAll('image[]').length,requests);assert.deepEqual(Buffer.from(await body.getAll('image[]')[0].arrayBuffer()),photo);
  for(const [key,value]of Object.entries({model:'gpt-image-2.5-flare',n:'1',quality:'medium',size:'1536x864',output_format:'png'}))assert.equal(body.get(key),value);
  if(requests===2){assert.deepEqual(Buffer.from(await body.getAll('image[]')[1].arrayBuffer()),finished);assert.match(body.get('prompt'),/image 1 is the original photograph, the authoritative source/);assert.match(body.get('prompt'),/preserve unrequested design features/);assert.match(body.get('prompt'),/REVISION SCOPE/);assert.doesNotMatch(body.get('prompt'),/REFERENCE PATTERN LIBRARY|REQUIRED SPATIAL EDIT|Choose one coherent material arrangement/);}
  return new Response(JSON.stringify({data:[{b64_json:finished.toString('base64')}]}));
 }});
 const result=await generateComplete(input,{generate:provider});assert.equal(result.generation_version,COMPLETE_GENERATION_VERSION);assert.ok(result.limitations.some(x=>x.includes('画素が同一の切り抜きは保証しません')));assert.equal(result.selectedRegions,undefined);assert.equal(result.assessment,undefined);
 const revision=await generateComplete({...input,revision:{parentImageId:'synthetic-original',imageDataUrl:dataUrl(finished),instruction:'見出しだけ少し小さく'}},{generate:provider});assert.equal(revision.revision.parentImageId,'synthetic-original');assert.equal(requests,2);
 await assert.rejects(()=>generateComplete(input,{generate:provider}),error=>error.code==='GENERATION_LIMIT');assert.equal(requests,2);
});

test('free recomposition control updates and restores the actual choice, keeps it while changing mood, and returns to photo preservation without generating',()=>{
 const nodes=[],document={createElement(tag){const node={tag,textContent:'',children:[],attributes:{},events:{},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.events[k]=v;}};nodes.push(node);return node;}};
 const control=value=>({value,events:{},addEventListener(k,v){this.events[k]=v;}}),designControl=control('auto'),compositionControl=control('text_left'),intentControl=control('');let saved=0;
 const guide=createEditorDesignGuide({root:document.createElement('section'),document,designControl,compositionControl,intentControl,onSelect:()=>saved++});
 const choose=nodes.find(x=>x.tag==='button'&&x.textContent==='写真の素材から再構成する（実験）'),status=nodes.find(x=>x.attributes.role==='status'),automatic=nodes.find(x=>x.textContent==='AIに構成を任せる');
 assert.equal(choose.attributes['aria-pressed'],'false');assert.equal(saved,0);choose.events.click();assert.equal(designControl.value,'recompose');assert.equal(compositionControl.value,'auto');assert.equal(choose.attributes['aria-pressed'],'true');assert.match(status.textContent,/位置か大きさ/);assert.match(status.textContent,/画素保持は保証されず/);assert.equal(saved,1);
 nodes.find(x=>x.tag==='button'&&x.textContent==='落ち着いた旅').events.click();assert.equal(designControl.value,'recompose');assert.match(intentControl.value,/ゆっくりした旅/);
 designControl.value='auto';guide.render();designControl.value='recompose';guide.render();assert.equal(choose.attributes['aria-pressed'],'true');automatic.events.click();assert.equal(designControl.value,'auto');assert.equal(choose.attributes['aria-pressed'],'false');assert.equal(automatic.attributes['aria-pressed'],'true');assert.equal(saved,3);
});

test('recomposition survives draft backup and restore with the same photograph and crop, without storing paid consent',async()=>{
 const draft={version:1,layout:'single',settings:[{zoom:1.2,x:.3,y:.6},{zoom:1,x:.5,y:.5}],files:[new Blob([photo],{type:'image/png'}),null],...input,consent:true};
 const zip=await createDraftBackup(draft),restored=await readDraftBackup(new Uint8Array(await zip.arrayBuffer()));assert.equal(restored.design,'recompose');assert.equal(restored.title,input.title);assert.deepEqual(restored.settings,draft.settings);assert.deepEqual(Buffer.from(await restored.files[0].arrayBuffer()),photo);assert.equal(restored.consent,undefined);assert.equal(restored.result,null);
});

test('shared ZIP and analysis retain per-image design choices in the same comparison without inventing measured regions or a human preference',async()=>{
 let state={groups:[],images:[],reviews:[]};
 for(const [index,design]of ['auto','recompose'].entries())state=addToGallery(state,await createEntry({...input,design},{imageDataUrl:dataUrl(png(1536,864,[40+index*40,60,80,255])),generation_version:COMPLETE_GENERATION_VERSION,limitations:['Synthetic test only']},{id:'synthetic-'+index}));
 assert.equal(state.groups.length,1);const report=comparisonReport(state),zip=await createCompleteShareZip(report),imported=await validateCompleteImport(await readComparisonFile(zip.blob));assert.deepEqual(imported.flatMap(x=>x.images.map(image=>image.design)),['auto','recompose']);assert.ok(imported.every(x=>x.review===null));
 const analysis=createCompleteReviewAnalysis();await analysis.consume(comparisonBundle(state,state.groups[0].id));const dataset=analysis.finish();assert.deepEqual(dataset.images.map(x=>x.design),['auto','recompose']);assert.equal(dataset.progress.completedHumanComparisons,0);assert.equal(dataset.scoringAgreement,null);assert.match(completePreview(dataset),/写真の素材から再構成/);assert.deepEqual(feedbackUsage(dataset.images[1]),{feedbackUsed:false,feedbackUsageKnown:true});
});

test('A binds service recomposition without copying it into the ordinary baseline and rejects changed design before dispatch',async t=>{
 const {consent,...value}=input,automatic=await freezeValidationA({...value,design:'auto'}),fixed=await freezeValidationA(value);assert.notEqual(fixed.caseId,automatic.caseId);assert.deepEqual(validationACase(fixed),fixed);await assertValidationAInput(fixed,input);assert.equal(fixed.chatgptPrompt,automatic.chatgptPrompt);assert.doesNotMatch(fixed.chatgptPrompt,/切り抜き|同じ人物を複製/);assert.match(fixed.servicePrompt,/MATERIAL RECOMPOSITION/);
 let paid=0;const server=makeServer({complete:async()=>{paid++;return {imageDataUrl:dataUrl(finished)};}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/complete-thumbnail`,{method:'POST',headers:{'Content-Type':'application/json','X-Validation-A-Case':automatic.caseId},body:JSON.stringify(input)});assert.equal(response.status,409);assert.equal(paid,0);
});

test('all three OpenAPI design enums allow recomposition while existing assessment and image contracts remain separate',async()=>{
 const schema=JSON.parse(await readFile(new URL('../shared/openapi.json',import.meta.url),'utf8'));let count=0;function visit(value){if(!value||typeof value!=='object')return;if(value.properties?.design?.description?.includes('not pixel-identical segmentation')){assert.ok(value.properties.design.enum.includes('recompose'));assert.match(value.properties.design.description,/not pixel-identical segmentation/);count++;}for(const child of Object.values(value))visit(child);}visit(schema);assert.equal(count,3);assert.equal(schema.info.version,'0.3.11');
});

test('a 0.9.0 fixed case cannot silently use strengthened 0.9.1 edit instructions; analysis keeps the historical memory status',async()=>{
 const {consent,...value}=input,fixed=await freezeValidationA(value);assert.equal(fixed.service.generationVersion,COMPLETE_GENERATION_VERSION);assert.match(fixed.servicePrompt,/isolate at least one/);assert.doesNotMatch(fixed.chatgptPrompt,/少なくとも1つを切り抜き|文字追加だけでは/);
 const prior={...fixed.service,generationVersion:'ai-complete-0.9.0'},oldCaseId='validation-a-'+createHash('sha256').update(JSON.stringify({requestSha256:fixed.requestSha256,service:prior,servicePromptSha256:fixed.servicePromptSha256})).digest('hex');
 const {checkValidationARequest}=await import('../backend/validation-a.mjs');await assert.rejects(()=>checkValidationARequest(input,oldCaseId),error=>error.code==='VALIDATION_A_MISMATCH');
 for(const version of ['ai-complete-0.9.0','ai-complete-0.9.1'])assert.deepEqual(feedbackUsage({result:{generation_version:version}}),{feedbackUsed:false,feedbackUsageKnown:true});assert.equal(feedbackUsage({result:{generation_version:'ai-complete-0.9.2'}}).feedbackUsageKnown,false);
});
