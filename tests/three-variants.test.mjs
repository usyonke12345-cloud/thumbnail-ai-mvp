import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {ApiError} from '../shared/contracts.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {generateCompleteBatch} from '../backend/generation/complete-batch.mjs';
import {validateComplete} from '../backend/generation/complete.mjs';
import {makeServer} from '../backend/server.mjs';
import {createEntry,addToGallery,comparisonBundle,checkGenerationCapacity} from '../frontend/complete-gallery-model.js';
import {validateCompleteBundle} from '../frontend/complete-png-transfer.js';
import {runThreeVariants} from '../frontend/complete-batch.js';
import {png,dataUrl} from './helpers/complete-png.mjs';

const fixture=JSON.parse(await readFile(new URL('../docs/fixtures/four-photos.json',import.meta.url),'utf8'));
const directions=JSON.parse(await readFile(new URL('../docs/fixtures/three-variants.json',import.meta.url),'utf8'));
const input=()=>({...structuredClone(fixture.input),consent:true});
const image=index=>dataUrl(png(1536,864,[index*50+20,40,80,255]));

test('three paid slots are reserved before dispatch, requests overlap, partial failures keep successes and the provider stays exclusively locked',async()=>{
 let started=0,release;
 const gate=new Promise(resolve=>release=resolve),seen=[];
 const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic',OPENAI_IMAGE_ENABLED:'true',OPENAI_MAX_CALLS:'4'},fetchImpl:async(url,{body})=>{
  const index=started++;
  assert.equal(body.get('n'),'1');assert.equal(body.get('quality'),'medium');assert.equal(body.getAll('image[]').length,4);
  seen.push(body.get('prompt'));
  await gate;
  return index===1?new Response('{}',{status:429}):Response.json({data:[{b64_json:png(1536,864,[index*50+20,40,80,255]).toString('base64')}]});
 }});
 const pending=generateCompleteBatch(input(),{generateBatch:inputs=>provider.batch(inputs)});
 for(let index=0;started<3&&index<100;index++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(started,3);
 assert.equal(provider.getStatus().calls,3);assert.equal(provider.getStatus().busy,true);
 await assert.rejects(()=>provider(validateComplete(input())),error=>error.code==='GENERATION_BUSY');
 await assert.rejects(()=>provider.batch([validateComplete(input()),validateComplete(input()),validateComplete(input())]),error=>error.code==='GENERATION_BUSY');
 release();
 const response=await pending;
 assert.equal(started,3);assert.equal(new Set(seen).size,3);assert.equal(provider.getStatus().busy,false);
 assert.equal(response.items[1].error.code,'PROVIDER_RATE_LIMIT');assert.ok(response.items[0].result);assert.ok(response.items[2].result);
 assert.ok(response.items.every(item=>Number.isInteger(item.elapsedMs)&&item.elapsedMs>=0));
 await assert.rejects(()=>provider.batch([validateComplete(input()),validateComplete(input()),validateComplete(input())]),error=>error.code==='GENERATION_LIMIT');
 assert.equal(started,3);assert.equal(provider.getStatus().calls,3);
});

test('a window with fewer than three slots blocks the entire batch and invalid/missing-reference input never reaches the provider',async()=>{
 let calls=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic',OPENAI_IMAGE_ENABLED:'true',OPENAI_MAX_CALLS:'2'},fetchImpl(){calls++;throw Error('Unexpected call');}});
 await assert.rejects(()=>generateCompleteBatch(input(),{generateBatch:inputs=>provider.batch(inputs)}),error=>error.code==='GENERATION_LIMIT');assert.equal(provider.getStatus().calls,0);assert.equal(calls,0);
 const generateBatch=async()=>{calls++;throw Error('Unexpected call');};
 await assert.rejects(()=>generateCompleteBatch({...input(),consent:false},{generateBatch}),error=>error.code==='CONSENT_REQUIRED');
 await assert.rejects(()=>generateCompleteBatch({...input(),referenceMode:'required'},{generateBatch,references:{store:{snapshot:async()=>({catalog:{records:[]}})}}}),error=>error.code==='REFERENCE_LIBRARY_INCOMPLETE');assert.equal(calls,0);
});

test('three directions honor explicit settings and successful outputs share one four-photo comparison group',async()=>{
 const response=await generateCompleteBatch(input(),{generateBatch:async inputs=>inputs.map((_,index)=>({status:'fulfilled',value:image(index),elapsedMs:10+index}))});
 assert.deepEqual(response.items.map(item=>item.settings),directions.expectedDirections);
 let gallery={groups:[],images:[],reviews:[]};
 for(const item of response.items)gallery=addToGallery(gallery,await createEntry({...input(),...item.settings},item.result));
 assert.equal(gallery.groups.length,1);assert.equal(gallery.images.length,3);await validateCompleteBundle(comparisonBundle(gallery,gallery.groups[0].id));
 const explicit={...input(),design:'editorial',composition:'text_right'};
 await generateCompleteBatch(explicit,{generateBatch:async inputs=>{assert.ok(inputs.every(value=>value.design==='editorial'&&value.composition==='text_right'));return inputs.map((_,index)=>({status:'fulfilled',value:image(index)}));}});
 const full={...gallery,images:Array.from({length:10},(_,index)=>({...gallery.images[0],id:'synthetic-'+index}))};
 await checkGenerationCapacity(full,input(),'');await assert.rejects(()=>checkGenerationCapacity(full,input(),'',3),/12枚/);
});

test('the batch HTTP entry accepts four photos and rejects frozen-A headers before dispatch',async()=>{
 let calls=0;const server=makeServer({batchComplete:async body=>{calls++;return generateCompleteBatch(body,{generateBatch:async inputs=>inputs.map((_,index)=>({status:'fulfilled',value:image(index)}))});}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const url='http://127.0.0.1:'+server.address().port+'/api/v1/complete-thumbnail-batch',body=JSON.stringify(input());assert.ok(Buffer.byteLength(body)>16384);
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body});assert.equal(r.status,200);assert.equal((await r.json()).items.length,3);
  const frozen=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Validation-A-Case':'synthetic'},body});assert.equal(frozen.status,400);assert.equal(calls,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('the browser keeps downloadable successes and records separate API and save failures',async()=>{
 const response=await generateCompleteBatch(input(),{generateBatch:async()=>[{status:'fulfilled',value:image(0),elapsedMs:5},{status:'rejected',reason:new ApiError(429,'PROVIDER_RATE_LIMIT','Synthetic failure'),elapsedMs:6},{status:'fulfilled',value:image(2),elapsedMs:7}]});
 const saved=[],finished=[],nodes=[];
 const document={createElement:tag=>{const node={tag,children:[],style:{},append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;}};nodes.push(node);return node;}};
 let nextId=0;
 const summary=await runThreeVariants({payload:input(),projectName:'',document,root:document.createElement('section'),gallery:{remember:async(payload,result)=>{saved.push({payload,result});if(saved.length===2)throw Error('Synthetic storage failure');}},history:{start:async()=> 'attempt-'+nextId++,finish:async(id,value)=>finished.push({id,...value})},onResult(){},onStatus(){},fetchImpl:async()=>Response.json(response)});
 assert.equal(summary.successes,2);assert.equal(summary.saveErrors,1);assert.equal(saved.length,2);
 assert.deepEqual(finished.map(value=>value.status),['success','api_error','save_error']);
 assert.equal(nodes.filter(node=>node.tag==='a'&&node.href?.startsWith('data:image/png')).length,2);
 assert.equal(saved[0].payload.composition,'text_left');assert.equal(saved[1].payload.composition,'text_right');
 assert.ok(finished.every(value=>value.elapsedMs>=0));
});

test('the real paid button dispatches the three-image flow only after consent and retains the one-image path',async()=>{
 const source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8');
 const start=source.indexOf("document.querySelector('#ai-complete').addEventListener('click'");
 const end=source.indexOf('\n});',start)+5;
 let handler,calls=0;
 const nodes={
  '#ai-complete':{disabled:false,addEventListener(type,value){handler=value;}},
  '#ai-reference-mode':{value:'required'},'#ai-visual-intent':{value:'自然な写真'},
  '#ai-consent':{checked:false},'#ai-headline-mode':{value:'auto'},
  '#ai-title':{value:'人工タイトル'},'#project-name':{value:''},'#ai-generation-count':{value:'3'}
 };
 const scope={document:{querySelector:key=>nodes[key]},layout:{value:'single'},photos:[{}],headline:{value:''},aiStatus:{textContent:''},startThreeVariants:async()=>calls++};
 runInNewContext(source.slice(start,end),scope);
 await handler({currentTarget:nodes['#ai-complete']});assert.equal(calls,0);
 nodes['#ai-consent'].checked=true;await handler({currentTarget:nodes['#ai-complete']});assert.equal(calls,1);
});

test('health refresh keeps the three-image label and explains insufficient batch capacity',async()=>{
 const source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8');
 const start=source.indexOf('async function checkAIStatus()'),end=source.indexOf('\ncheckAIStatus();',start);
 const control={},count={value:'3'},aiStatus={};
 let calls=2;
 const scope={document:{querySelector:key=>key==='#ai-complete'?control:count},aiStatus,fetch:async()=>({ok:true,json:async()=>({completeGeneration:{enabled:true,keyConfigured:true,busy:false,calls,maxCalls:15}})})};
 runInNewContext(source.slice(start,end),scope);
 await scope.checkAIStatus();assert.equal(control.disabled,false);assert.match(control.textContent,/3案.*3枚分.*残り13回/);
 calls=13;await scope.checkAIStatus();assert.equal(control.disabled,true);assert.match(aiStatus.textContent,/3枚分必要/);
 count.value='1';await scope.checkAIStatus();assert.equal(control.disabled,false);assert.match(control.textContent,/1枚.*残り2回/);
});
