import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {COMPLETE_DESIGNS,completeDesignInstructions} from '../shared/complete-designs.mjs';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {validateComplete} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {createEditorDesignGuide} from '../frontend/editor-design-guide.js';
import {makeServer} from '../backend/server.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';

const photograph=png(1280,720,[30,70,100,255]),input={title:'A calm morning',brief:'A slow everyday walk',headline:'CALM MORNING',headlineMode:'manual',imageDataUrl:dataUrl(photograph),consent:true};

test('design recipes request different letterforms and headline zones, while preserving the photograph',()=>{
 const recipes=Object.values(COMPLETE_DESIGNS);
 assert.equal(new Set(recipes.map(x=>x.fontClass)).size,3);assert.equal(new Set(recipes.map(x=>x.layoutClass)).size,3);
 for(const [design,zone,font]of [['photo_focus','FULL-SCENE / BOTTOM CAPTION','humanist sans-serif'],['editorial','EDITORIAL / TOP HEADLINE','editorial serif'],['impact','SIDE HEADLINE / TYPOGRAPHIC HIERARCHY','condensed sans-serif']]){
  const prompt=completePrompt({...input,design,composition:'auto'});
  assert.match(prompt,new RegExp(zone));assert.ok(prompt.includes(font));
  assert.match(prompt,/Do not isolate or reposition a person, repaint skin/);
  assert.match(prompt,/exact facial features, expression, pose/);
  assert.match(prompt,/Do not substitute palette changes/);
  assert.match(prompt,/Render exactly the supplied headline/);assert.ok(prompt.includes(input.headline));
  assert.ok(!prompt.includes('You may isolate and reposition'));
 }
});

test('automatic art direction considers photographic space and video context without restricting the result to three recipes',async()=>{
 const automatic=validateComplete({...input,headlineMode:'auto',headline:null,design:'auto',composition:'auto'}),prompt=completePrompt(automatic);
 assert.match(prompt,/AUTO ART DIRECTION/);assert.match(prompt,/faces, hands and important objects/);assert.match(prompt,/unobstructed low-detail space/);assert.match(prompt,/topic and mood/);assert.match(prompt,/left, right, upper and lower headline zones/);assert.match(prompt,/not a closed list/);assert.match(prompt,/Do not create empty space by relocating/);assert.match(prompt,/broad cloudy blur/);assert.ok(!prompt.includes('DESIGN RECIPE:'));
 let calls=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'fake-test-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{
  calls++;assert.match(url,/images\/edits$/);assert.equal(body.get('n'),'1');assert.equal(body.get('quality'),'medium');assert.equal(body.get('model'),'gpt-image-2.5-flare');assert.equal(body.get('prompt'),prompt);assert.deepEqual(Buffer.from(await body.get('image[]').arrayBuffer()),photograph);
  return new Response(JSON.stringify({data:[{b64_json:png(1536,864).toString('base64')}]}));
 }});
 await provider(automatic);await assert.rejects(()=>provider(automatic),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
 for(const [composition,marker]of [['text_left','left-headline'],['text_right','right-headline'],['text_top','top-headline']]){
  const fixed=completeDesignInstructions('auto',composition);assert.ok(fixed.includes(marker));assert.ok(!fixed.includes('Consider left, right, upper and lower'));assert.match(fixed,/explicit placement is a user constraint/);
 }
});

test('explicit composition replaces every default headline zone instead of adding contradictory instructions',()=>{
 for(const design of Object.keys(COMPLETE_DESIGNS))for(const [composition,marker]of [['text_left','left-headline'],['text_right','right-headline'],['text_top','top-headline']]){
  const instructions=completeDesignInstructions(design,composition);
  assert.ok(instructions.includes(marker));assert.ok(!instructions.includes(COMPLETE_DESIGNS[design].placement));assert.ok(instructions.includes(COMPLETE_DESIGNS[design].typography));
 }
 assert.throws(()=>completeDesignInstructions('unknown'));assert.throws(()=>completeDesignInstructions('photo_focus','unknown'));
});

test('all three design choices reach a single image edit with identical photo, exact text and unchanged cost settings',async()=>{
 let requests=0;
 const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'fake-test-key',OPENAI_IMAGE_ENABLED:'true',OPENAI_MAX_CALLS:'3'},fetchImpl:async(url,{body})=>{
  const design=Object.keys(COMPLETE_DESIGNS)[requests++];
  assert.match(url,/images\/edits$/);assert.equal(body.get('n'),'1');assert.equal(body.get('quality'),'medium');assert.equal(body.get('model'),'gpt-image-2.5-flare');assert.equal(body.get('size'),'1536x864');
  assert.deepEqual(Buffer.from(await body.get('image[]').arrayBuffer()),photograph);
  assert.ok(body.get('prompt').includes(`DESIGN RECIPE: ${design}`));assert.ok(body.get('prompt').includes(COMPLETE_DESIGNS[design].typography));assert.ok(body.get('prompt').includes(input.headline));
  return new Response(JSON.stringify({data:[{b64_json:png(1536,864).toString('base64')}]}));
 }});
 for(const design of Object.keys(COMPLETE_DESIGNS))await provider(validateComplete({...input,design}));
 assert.equal(requests,3);assert.equal(provider.getStatus().calls,3);
});

function dom(){
 const all=[];const document={createElement(tag){const node={tag,children:[],textContent:'',className:'',attributes:{},events:{},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},setAttribute(key,value){this.attributes[key]=value;},addEventListener(key,fn){this.events[key]=fn;}};all.push(node);return node;}};
 return {document,all};
}
test('free design choices update the actual control, selected state and composition explanation, including restored values',()=>{
 const {document,all}=dom(),root=document.createElement('section'),designControl={value:'auto',events:{},addEventListener(k,v){this.events[k]=v;}},compositionControl={value:'auto',events:{},addEventListener(k,v){this.events[k]=v;}};
 let saved=0;const guide=createEditorDesignGuide({root,designControl,compositionControl,document,onSelect:()=>saved++});
 const automatic=all.find(x=>x.textContent==='AIに構成を任せる'),buttons=all.filter(x=>x.tag==='button'&&Object.values(COMPLETE_DESIGNS).some(recipe=>recipe.label===x.textContent)),status=all.find(x=>x.attributes.role==='status');assert.equal(buttons.length,3);assert.equal(saved,0);assert.equal(automatic.attributes['aria-pressed'],'true');assert.match(status.textContent,/写真の主役/);
 for(const [i,id]of Object.keys(COMPLETE_DESIGNS).entries()){
  buttons[i].events.click();assert.equal(designControl.value,id);assert.equal(saved,i+1);assert.equal(buttons.filter(x=>x.attributes['aria-pressed']==='true').length,1);assert.ok(status.textContent.includes(COMPLETE_DESIGNS[id].fontLabel));
 }
 compositionControl.value='text_left';compositionControl.events.change();assert.match(status.textContent,/構図を固定/);assert.match(status.textContent,/文字を左/);
 designControl.value='editorial';compositionControl.value='auto';guide.render();assert.ok(status.textContent.includes(COMPLETE_DESIGNS.editorial.layoutLabel));assert.equal(buttons[1].attributes['aria-pressed'],'true');assert.equal(saved,3);
 designControl.value='auto';guide.render();assert.ok(buttons.every(x=>x.attributes['aria-pressed']==='false'));
 designControl.value='impact';compositionControl.value='text_right';guide.render();assert.equal(automatic.attributes['aria-pressed'],'false');automatic.events.click();assert.equal(designControl.value,'auto');assert.equal(compositionControl.value,'auto');assert.equal(automatic.attributes['aria-pressed'],'true');assert.equal(saved,4);assert.match(status.textContent,/配置もAIに任せ/);assert.ok(buttons.every(x=>x.attributes['aria-pressed']==='false'));
});

test('editor design modules and their shared catalog are served without exposing unrelated files or making paid calls',async t=>{
 const server=makeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}`;
 const before=await (await fetch(url+'/api/v1/health')).json();
 for(const path of ['/editor-design-guide.js','/shared/complete-designs.mjs']){const response=await fetch(url+path);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.match(await response.text(),/COMPLETE_DESIGNS/);}
 assert.equal((await fetch(url+'/shared/contracts.mjs')).status,404);
 const html=await (await fetch(url+'/editor')).text();assert.match(html,/id="ai-design-guide"/);
 const app=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8');assert.match(app,/designGuide\.render\(\)/);
 const after=await (await fetch(url+'/api/v1/health')).json();assert.equal(before.completeGeneration.calls,after.completeGeneration.calls);
});
