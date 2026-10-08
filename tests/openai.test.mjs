import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {runPipeline} from '../backend/pipeline.mjs';
const env={OPENAI_API_KEY:'test-secret-do-not-log',OPENAI_IMAGE_ENABLED:'true',OPENAI_MAX_CALLS:'2',OPENAI_TIMEOUT_MS:'1000'};
// Header fixture only: checks boundary validation, not rendering or image quality.
const header=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.write('IHDR',12);header.writeUInt32BE(1536,16);header.writeUInt32BE(1024,20);
const validResponse=()=>new Response(JSON.stringify({data:[{b64_json:header.toString('base64')}]}));
test('one background call has bounded parameters and no key in payload',async()=> {
 let called=0;
 const generate=createOpenAIBackgroundProvider({env,fetchImpl:async(url,options)=>{
   called++;assert.equal(url,'https://api.openai.com/v1/images/generations');assert.equal(options.headers.Authorization,`Bearer ${env.OPENAI_API_KEY}`);
   const body=JSON.parse(options.body);assert.equal(body.n,1);assert.equal(body.quality,'low');assert.equal(body.size,'1536x1024');assert.equal(body.output_format,'png');assert.equal(body.model,'gpt-image-2.5-flare');assert.ok(!options.body.includes(env.OPENAI_API_KEY));return validResponse();
 }});
 assert.match(await generate({title:'AI入門',genre:'education'}),/^data:image\/png;base64,/);assert.equal(called,1);
});
test('missing key, paid opt-in, and invalid limits prevent any network request',async()=> {
 for(const [settings,code] of [[{},'API_KEY_MISSING'],[{OPENAI_API_KEY:'key'},'PAID_GENERATION_DISABLED'],[{...env,OPENAI_MAX_CALLS:'NaN'},'PROVIDER_CONFIG']]) {
   const generate=createOpenAIBackgroundProvider({env:settings,fetchImpl:()=>{assert.fail('must not call API');}});
   await assert.rejects(generate({title:'x'}),e=>e.code===code);
 }
});
test('provider errors do not expose upstream messages or retry',async()=> {
 for(const [status,code] of [[401,'PROVIDER_AUTH'],[403,'PROVIDER_AUTH'],[429,'PROVIDER_RATE_LIMIT'],[500,'PROVIDER_ERROR']]) {
   let calls=0;
   const generate=createOpenAIBackgroundProvider({env,fetchImpl:async()=>{calls++;return new Response(env.OPENAI_API_KEY,{status});}});
   await assert.rejects(generate({title:'x'}),e=>e.code===code&&!e.message.includes(env.OPENAI_API_KEY));assert.equal(calls,1);
 }
});
test('empty, malformed or wrong-sized PNG responses fail',async()=> {
 for(const value of [{data:[]},{data:[{b64_json:'notbase64'}]},{data:[{b64_json:Buffer.from('not PNG').toString('base64')}]}]) {
   const generate=createOpenAIBackgroundProvider({env,fetchImpl:async()=>new Response(JSON.stringify(value))});
   await assert.rejects(generate({title:'x'}),e=>e.code==='PROVIDER_RESPONSE');
 }
});
test('concurrent requests and cumulative calls are limited',async()=> {
 let resolve;const gate=new Promise(r=>resolve=r);
 const generate=createOpenAIBackgroundProvider({env:{...env,OPENAI_MAX_CALLS:'1'},fetchImpl:async()=>{await gate;return validResponse();}});
 const first=generate({title:'x'});
 await assert.rejects(generate({title:'x'}),e=>e.code==='GENERATION_BUSY');resolve();await first;
 await assert.rejects(generate({title:'x'}),e=>e.code==='GENERATION_LIMIT');
});
test('timeout and network failure are recoverable structured errors',async()=> {
 const timeout=createOpenAIBackgroundProvider({env,fetchImpl:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true}))});
 await assert.rejects(timeout({title:'x'}),e=>e.status===504&&e.code==='PROVIDER_TIMEOUT');
 const network=createOpenAIBackgroundProvider({env,fetchImpl:async()=>{throw new Error(env.OPENAI_API_KEY);}});
 await assert.rejects(network({title:'x'}),e=>e.code==='PROVIDER_NETWORK'&&!e.message.includes(env.OPENAI_API_KEY));
});
test('AI background flows through existing scoring into three SVG candidates',async()=> {
 const keys=['GENERATION_PROVIDER',...Object.keys(env)];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const previousFetch=globalThis.fetch;let calls=0;
 try {
   Object.assign(process.env,env,{GENERATION_PROVIDER:'openai'});
   globalThis.fetch=async()=>{calls++;return validResponse();};
   const result=await runPipeline({title:'初心者のAI入門',genre:'education'});
   assert.equal(result.mode,'ai_background');assert.equal(calls,1);assert.equal(result.candidates.length,3);
   for(const candidate of result.candidates) {
     const svg=Buffer.from(candidate.imageDataUrl.split(',')[1],'base64').toString('utf8');
     assert.match(svg,/<image href="data:image\/png;base64,/);assert.match(svg,/AI BACKGROUND/);assert.ok(!svg.includes(env.OPENAI_API_KEY));
     assert.equal(candidate.width,1280);assert.equal(candidate.metadata.lineCount,1);assert.equal(candidate.assessment.kind,'layout_heuristic');
   }
 } finally {globalThis.fetch=previousFetch;for(const key of keys){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
});
