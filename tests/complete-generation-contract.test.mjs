import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateComplete,generateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {bundle,png,dataUrl} from './helpers/complete-png.mjs';

const spec=JSON.parse(await readFile(new URL('../shared/openapi.json',import.meta.url),'utf8'));
const schema=spec.paths['/api/v1/complete-thumbnail'].post.requestBody.content['application/json'].schema;
const fixture=JSON.parse(await readFile(new URL('../docs/fixtures/complete-generation-options.json',import.meta.url),'utf8'));

// Checks only keywords used by this request schema; conditional branches are essential here.
function matches(value,s){
 if(s.$ref)s=spec.components.schemas[s.$ref.split('/').at(-1)];
 if(s.type&&!([s.type].flat().includes(value===null?'null':Array.isArray(value)?'array':typeof value)))return false;
 if('const'in s&&value!==s.const||s.enum&&!s.enum.includes(value))return false;
 if(typeof value==='string'&&(s.minLength!==undefined&&[...value].length<s.minLength||s.maxLength!==undefined&&[...value].length>s.maxLength))return false;
 if(typeof value==='string'&&s.pattern&&!new RegExp(s.pattern).test(value))return false;
 if(Array.isArray(value)&&s.items&&!value.every(item=>matches(item,s.items)))return false;
 if(Array.isArray(value)&&(s.minItems!==undefined&&value.length<s.minItems||s.maxItems!==undefined&&value.length>s.maxItems||s.uniqueItems&&new Set(value.map(x=>JSON.stringify(x))).size!==value.length))return false;
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  if((s.required??[]).some(k=>!Object.hasOwn(value,k)))return false;
  if(Object.keys(value).some(k=>s.properties?.[k]?!matches(value[k],s.properties[k]):s.additionalProperties===false))return false;
 }
 if(s.allOf&&!s.allOf.every(part=>matches(value,part)))return false;
 if(s.if&&!matches(value,matches(value,s.if)?s.then??{}:s.else??{}))return false;
 return true;
}

test('synthetic complete requests agree with OpenAPI for manual compatibility and automatic headline choices',()=>{
 assert.equal(fixture.source,'synthetic');assert.equal(fixture.generationVersion,COMPLETE_GENERATION_VERSION);
 for(const item of fixture.cases){
  const input={...item.input,imageDataUrl:fixture.imageDataUrl};
  assert.ok(matches(input,schema),item.name);
  const actual=validateComplete(input);
  assert.equal(actual.headlineMode,item.expected.headlineMode,item.name);
  assert.equal(actual.headline,item.expected.headline,item.name);
  assert.equal(actual.design,item.expected.design,item.name);
  assert.equal(actual.brief,item.expected.brief,item.name);
  assert.equal(actual.visualIntent,item.expected.visualIntent,item.name);
 }
 const base={...fixture.cases[0].input,imageDataUrl:fixture.imageDataUrl};
 const {headline,...noHeadline}=base;
 for(const input of [noHeadline,{...base,headlineMode:'manual',headline:null},{...base,headlineMode:'auto'},{...base,design:'unknown'},{...base,headlineMode:'unknown'},{...base,brief:null},{...base,brief:'x'.repeat(1001)},{...base,visualIntent:null},{...base,visualIntent:'x'.repeat(301)},{...base,extra:true}]){
  assert.equal(matches(input,schema),false);
  assert.throws(()=>validateComplete(input));
 }
});
test('complete response contract includes parent identity only for revisions and rejects malformed hashes',async()=>{
 const parent=await bundle({count:1,review:false}),input={title:'Synthetic revision',headlineMode:'auto',imageDataUrl:parent.group.sourceImageDataUrl,consent:true},responseSchema=spec.paths['/api/v1/complete-thumbnail'].post.responses['200'].content['application/json'].schema;
 const generate=async()=>dataUrl(png()),normal=await generateComplete(input,{generate});assert.ok(matches(normal,responseSchema));assert.equal(normal.revision,undefined);
 const revision={instruction:'穏やかな文字へ',parentImageId:parent.images[0].id,imageDataUrl:parent.images[0].result.imageDataUrl},response=await generateComplete({...input,revision},{generate});assert.ok(matches(response,responseSchema));assert.ok(matches({...input,revision},schema));assert.equal(response.revision.parentImageSha256,parent.images[0].imageSha256);
 for(const ref of [{...response.revision,parentImageSha256:'wrong'},{parentImageId:revision.parentImageId},{...response.revision,extra:true}])assert.equal(matches({...response,revision:ref},responseSchema),false);
});
test('optional historical feedback agrees with request and response schemas and rejects malformed snapshots',async()=>{
 const fixture=JSON.parse(await readFile(new URL('../docs/fixtures/generation-feedback.json',import.meta.url),'utf8')),feedback=fixture.feedback,parent=await bundle({count:1,review:false}),input={title:'Synthetic feedback',headlineMode:'auto',imageDataUrl:parent.group.sourceImageDataUrl,consent:true,feedback},responseSchema=spec.paths['/api/v1/complete-thumbnail'].post.responses['200'].content['application/json'].schema;
 assert.ok(matches(input,schema));validateComplete(input);const response=await generateComplete(input,{generate:async()=>dataUrl(png())});assert.ok(matches(response,responseSchema));assert.deepEqual(response.feedbackApplied,feedback);
 for(const change of [{version:'unknown'},{scope:'all'},{records:[]},{records:Array(7).fill(feedback.records[0])},{reviewerId:''},{extra:true}]){const invalid={...feedback,...change};assert.equal(matches({...input,feedback:invalid},schema),false);assert.equal(matches({...response,feedbackApplied:invalid},responseSchema),false);assert.throws(()=>validateComplete({...input,feedback:invalid}));}
 for(const change of [{reason:'x'.repeat(501)},{reason:'\u0000bad'},{selectedImageId:'not-null'},{issues:['text','text']},{images:[]}]){const invalid={...feedback,records:[{...feedback.records[0],...change}]};assert.equal(matches({...input,feedback:invalid},schema),false);assert.throws(()=>validateComplete({...input,feedback:invalid}));}
});
