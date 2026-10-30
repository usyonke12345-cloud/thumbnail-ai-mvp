import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateComplete,generateComplete,COMPLETE_GENERATION_VERSION,MULTI_COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {completePrompt} from '../backend/generation/complete-prompt.mjs';
import {additionalPhotoInputs,sourcePhotoHashes} from '../shared/multi-photo.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';

const sources=[[30,40,50,255],[80,90,100,255],[130,140,150,255]].map(color=>png(1280,720,color));
const sha=b=>createHash('sha256').update(b).digest('hex');
const input={title:'人工データ：旅行の見どころ',brief:'',headlineMode:'auto',consent:true,imageDataUrl:dataUrl(sources[0]),additionalImageDataUrls:sources.slice(1).map(dataUrl)};
test('three separate source photos reach one edit in order, followed by revision and style assets with explicit roles',async()=>{
 const previous=png(),reference=png(2,2),finished=png();let calls=0;
 const provider=createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic-key',OPENAI_IMAGE_ENABLED:'true'},fetchImpl:async(url,{body})=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');
  const images=body.getAll('image[]');assert.equal(images.length,5);
  for(let i=0;i<3;i++){assert.deepEqual(Buffer.from(await images[i].arrayBuffer()),sources[i]);assert.equal(images[i].name,i?'source-'+(i+1)+'.png':'source.png');}
  assert.deepEqual(Buffer.from(await images[3].arrayBuffer()),previous);assert.equal(images[3].name,'previous.png');
  assert.deepEqual(Buffer.from(await images[4].arrayBuffer()),reference);assert.equal(images[4].name,'reference-1.png');
  const prompt=body.get('prompt');assert.match(prompt,/Images 1 through 3 are the only photographic material/);assert.match(prompt,/image 4 is the previous completed thumbnail/);
  assert.match(prompt,/Reference image 5 illustrates candidate 1/);assert.match(prompt,/never merge faces/);assert.match(prompt,/choose one coherent depiction/);
  assert.doesNotMatch(prompt,/image 1, is the sole source|image 1 is the sole authority/);assert.equal(body.get('n'),'1');assert.equal(body.get('model'),'gpt-image-2.5-flare');
  assert.equal(body.get('quality'),'medium');assert.equal(body.get('size'),'1536x864');assert.ok(prompt.length<32000);
  return new Response(JSON.stringify({data:[{b64_json:finished.toString('base64')}]}));
 }});
 const value=validateComplete({...input,revision:{instruction:'文字を少し小さく',parentImageId:'synthetic-parent',imageDataUrl:dataUrl(previous)}});
 value._references={assets:[{videoId:'abcdefghijk',bytes:reference,mimeType:'image/png',extension:'png'}],rows:[{videoId:'abcdefghijk',observation:{material:'scene',typography:'synthetic',layout:'synthetic'}}],context:{librarySha256:'a'.repeat(64)}};
 await provider(value);assert.equal(calls,1);
 await assert.rejects(()=>provider(value),e=>e.code==='GENERATION_LIMIT');assert.equal(calls,1);
});
test('multi source response records all ordered input hashes without changing single-photo output semantics',async()=>{
 let calls=0;const generate=async v=>{calls++;assert.equal(v.additionalImageDataUrls.length,2);return dataUrl(png());};
 const result=await generateComplete(input,{generate});assert.equal(calls,1);assert.equal(result.generation_version,MULTI_COMPLETE_GENERATION_VERSION);
 assert.deepEqual(result.sourcePhotoSha256s,sources.map(sha));assert.equal(result.feedbackApplied,undefined);
 const {additionalImageDataUrls,...single}=input,resultSingle=await generateComplete({...single,additionalImageDataUrls:[]},{generate:async v=>{assert.equal(v.additionalImageDataUrls,undefined);return dataUrl(png());}});
 assert.equal(resultSingle.generation_version,COMPLETE_GENERATION_VERSION);assert.equal(resultSingle.sourcePhotoSha256s,undefined);
 assert.match(completePrompt(validateComplete(single)),/image 1, the original photograph, is the only authority/);
});
test('bad photo counts, dimensions, formats, duplicates and limits are rejected before provider dispatch',async()=>{
 for(const additionalImageDataUrls of [null,{},[...input.additionalImageDataUrls,dataUrl(png(1280,720,[2,3,4,255]))],[input.imageDataUrl],[input.additionalImageDataUrls[0],input.additionalImageDataUrls[0]],['data:image/jpeg;base64,YQ=='],[dataUrl(png(50,50))],['data:image/png;base64,'+'A'.repeat(3*1024*1024)]]){
  let calls=0;await assert.rejects(()=>generateComplete({...input,additionalImageDataUrls},{generate:async()=>{calls++;return dataUrl(png());}}),e=>e.code==='INVALID_IMAGE');assert.equal(calls,0);
 }
 assert.deepEqual(additionalPhotoInputs(undefined),[]);assert.throws(()=>sourcePhotoHashes(['x']));assert.throws(()=>sourcePhotoHashes(['a'.repeat(64),'a'.repeat(64)]));
});

test('multi-photo art direction has no single-source or no-relocation contradiction in any design',()=>{
 for(const design of ['auto','photo_focus','editorial','impact','recompose'])for(const composition of ['auto','text_left','text_right','text_top']){
  const prompt=completePrompt(validateComplete({...input,design,composition}));assert.match(prompt,/Images 1 through 3 are the only photographic material/);
  assert.doesNotMatch(prompt,/sole photographic source|Keep the photographed scene and subject positions intact|through whole-photo cropping only|do not isolate or relocate|only authority for people/i);
 }
});
