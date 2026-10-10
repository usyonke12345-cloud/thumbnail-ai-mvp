import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';

const spec=JSON.parse(await readFile(new URL('../shared/openapi.json',import.meta.url),'utf8'));
const schema=spec.paths['/api/v1/complete-thumbnail'].post.requestBody.content['application/json'].schema;
const fixture=JSON.parse(await readFile(new URL('../docs/fixtures/complete-generation-options.json',import.meta.url),'utf8'));

// Checks only keywords used by this request schema; conditional branches are essential here.
function matches(value,s){
 if(s.type&&!([s.type].flat().includes(value===null?'null':Array.isArray(value)?'array':typeof value)))return false;
 if('const'in s&&value!==s.const||s.enum&&!s.enum.includes(value))return false;
 if(typeof value==='string'&&(s.minLength!==undefined&&[...value].length<s.minLength||s.maxLength!==undefined&&[...value].length>s.maxLength))return false;
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
 }
 const base={...fixture.cases[0].input,imageDataUrl:fixture.imageDataUrl};
 const {headline,...noHeadline}=base;
 for(const input of [noHeadline,{...base,headlineMode:'manual',headline:null},{...base,headlineMode:'auto'},{...base,design:'unknown'},{...base,headlineMode:'unknown'},{...base,extra:true}]){
  assert.equal(matches(input,schema),false);
  assert.throws(()=>validateComplete(input));
 }
});
