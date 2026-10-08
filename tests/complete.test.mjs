import test from 'node:test';
import assert from 'node:assert/strict';
import {validateComplete} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
function png(w,h){const b=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b.toString('base64');}
const input={title:'Hair',brief:'Find a haircut',headline:'FIND YOUR\nPERFECT HAIRSTYLE',imageDataUrl:`data:image/png;base64,${png(1280,720)}`,consent:true};
test('complete input requires explicit consent and bounded photograph',()=>{
 assert.equal(validateComplete(input).complete,true);
 for(const bad of [{...input,consent:false},{...input,imageDataUrl:'https://example.com/a.png'},{...input,headline:''},{...input,imageDataUrl:`data:image/png;base64,${png(2,2)}`}])assert.throws(()=>validateComplete(bad));
});
test('complete edit uploads one image and shares call budget with background generation',async()=>{
 let calls=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'test-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,options)=>{calls++;assert.match(url,/images\/edits$/);assert.equal(options.body.get('size'),'1536x864');assert.equal(options.body.get('n'),'1');assert.equal(options.body.get('quality'),'medium');assert.ok(options.body.get('image[]') instanceof Blob);assert.ok(!options.body.get('prompt').includes('test-key'));return new Response(JSON.stringify({data:[{b64_json:png(1536,864)}]}));}});
 assert.match(await provider(validateComplete(input)),/^data:image\/png/);await assert.rejects(()=>provider({title:'background'}),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
});
