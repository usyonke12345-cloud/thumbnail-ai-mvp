import test from 'node:test';
import assert from 'node:assert/strict';
import {validateComplete} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
function png(w,h){const b=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b.toString('base64');}
const input={title:'Hair',brief:'Find a haircut',headline:'FIND YOUR\nPERFECT HAIRSTYLE',imageDataUrl:`data:image/png;base64,${png(1280,720)}`,consent:true};
test('complete input requires explicit consent and bounded photograph',()=>{
 assert.equal(validateComplete(input).complete,true);
 for(const bad of [{...input,consent:false},{...input,imageDataUrl:'https://example.com/a.png'},{...input,headline:''},{...input,imageDataUrl:`data:image/png;base64,${png(2,2)}`}])assert.throws(()=>validateComplete(bad));
});
test('complete edit uploads one image and shares call budget with background generation',async()=>{
 let calls=0;const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'test-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,options)=>{calls++;assert.match(url,/images\/edits$/);assert.equal(options.body.get('size'),'1536x864');assert.equal(options.body.get('n'),'1');assert.equal(options.body.get('quality'),'medium');assert.ok(options.body.get('image[]') instanceof Blob);assert.deepEqual(Buffer.from(await options.body.get('image[]').arrayBuffer()),Buffer.from(input.imageDataUrl.split(',')[1],'base64'));assert.match(options.body.get('prompt'),/mandatory primary visual material/);assert.match(options.body.get('prompt'),/Do not invent replacement people/);assert.ok(!options.body.get('prompt').includes('test-key'));return new Response(JSON.stringify({data:[{b64_json:png(1536,864)}]}));}});
 assert.match(await provider(validateComplete(input)),/^data:image\/png/);await assert.rejects(()=>provider({title:'background'}),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
});
test('AI button explains missing photo or consent beside the button without a paid request',async()=>{
 const source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8'),handler=source.slice(source.lastIndexOf("document.querySelector('#ai-complete').addEventListener")).split('// Draft lifecycle')[0];
 let callback,calls=0;const nodes=new Map([['#ai-complete',{addEventListener:(type,fn)=>callback=fn}],['#ai-consent',{checked:false}]]),aiStatus={textContent:''};
 const scope={document:{querySelector:s=>nodes.get(s)},layout:{value:'single'},photos:[null],aiStatus,fetch:()=>{calls++;throw new Error('must not call');}};
 vm.runInNewContext(handler,scope);await callback({currentTarget:{disabled:false}});assert.match(aiStatus.textContent,/写真を読み込んで/);
 scope.photos[0]={};await callback({currentTarget:{disabled:false}});assert.match(aiStatus.textContent,/確認にチェック/);assert.equal(calls,0);
});
