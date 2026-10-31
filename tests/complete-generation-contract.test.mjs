import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateComplete,generateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {bundle,png,dataUrl} from './helpers/complete-png.mjs';
import {freezeValidationA,checkValidationARequest} from '../backend/validation-a.mjs';
import {createEntry,comparisonBundle} from '../frontend/complete-gallery-model.js';
import {diagnosticRequest} from '../frontend/complete-png-transfer.js';
import {analyzePngAssets} from '../backend/analysis/complete-png.mjs';

const spec=JSON.parse(await readFile(new URL('../shared/openapi.json',import.meta.url),'utf8'));
const schema=spec.paths['/api/v1/complete-thumbnail'].post.requestBody.content['application/json'].schema;
const fixture=JSON.parse(await readFile(new URL('../docs/fixtures/complete-generation-options.json',import.meta.url),'utf8'));

// Checks only keywords used by this request schema; conditional branches are essential here.
function matches(value,s){
 if(s.$ref)s=spec.components.schemas[s.$ref.split('/').at(-1)];
 if(s.type&&![s.type].flat().some(type=>type==='integer'?Number.isInteger(value):type===(value===null?'null':Array.isArray(value)?'array':typeof value)))return false;
 if(typeof value==='number'&&(s.minimum!==undefined&&value<s.minimum||s.maximum!==undefined&&value>s.maximum))return false;
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
 if(s.anyOf&&!s.anyOf.some(part=>matches(value,part)))return false;
 if(s.not&&matches(value,s.not))return false;
 if(s.if&&!matches(value,matches(value,s.if)?s.then??{}:s.else??{}))return false;
 return true;
}

test('multi-photo fixture, frozen receipt and local diagnostics agree with the expanded contract',async()=>{
 const f=JSON.parse(await readFile(new URL('../docs/fixtures/multi-photo.json',import.meta.url),'utf8')),v={...f.input,consent:true};assert.equal(f.source,'synthetic');assert.equal(matches(v,schema),true);validateComplete(v);
 const response=await generateComplete(v,{generate:async()=>dataUrl(png())}),responseSchema=spec.paths['/api/v1/complete-thumbnail'].post.responses['200'].content['application/json'].schema;
 assert.equal(response.generation_version,f.generationVersion);assert.equal(matches(response,responseSchema),true);
 const {sourcePhotoSha256s,...missing}=response;assert.equal(matches(missing,responseSchema),false);
 for(const additionalImageDataUrls of [null,{},[...v.additionalImageDataUrls,v.additionalImageDataUrls[0]],['not a PNG']])assert.equal(matches({...v,additionalImageDataUrls},schema),false);
 const fixed=await freezeValidationA(f.input);assert.equal(matches(fixed,{$ref:'#/components/schemas/ValidationACase'}),true);const receipt=await checkValidationARequest(v,fixed.caseId);assert.equal(matches({...response,validationA:receipt},responseSchema),true);
 assert.equal(matches({...fixed,version:'validation-a-case-1.0.0'},{$ref:'#/components/schemas/ValidationACase'}),false);
 const entry=await createEntry(f.input,response),bundle=comparisonBundle({groups:[entry.group],images:[entry.image],reviews:[]},entry.group.id),request=await diagnosticRequest(bundle),diagnostic=analyzePngAssets(request);
 assert.equal(matches(request,{$ref:'#/components/schemas/CompleteDiagnosticRequest'}),true);assert.equal(matches(diagnostic,{$ref:'#/components/schemas/CompleteDiagnosticResponse'}),true);
 assert.equal(matches({...request,assetVersion:'image-assets-1.0.0'},{$ref:'#/components/schemas/CompleteDiagnosticRequest'}),false);
});

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

test('free A snapshot and optional generation receipt agree with OpenAPI while memo, revision and consent are forbidden in freeze input',async()=>{
 const f=JSON.parse(await readFile(new URL('../docs/fixtures/validation-a.json',import.meta.url),'utf8')),input={...f.input,imageDataUrl:fixture.imageDataUrl},fixed=await freezeValidationA(input),freezeSchema=spec.paths['/api/v1/validation-a/freeze'].post.requestBody.content['application/json'].schema;
 assert.equal(f.source,'synthetic');assert.ok(matches(input,freezeSchema));assert.ok(matches(fixed,{$ref:'#/components/schemas/ValidationACase'}));
 for(const key of ['consent','revision','feedback'])assert.equal(matches({...input,[key]:null},freezeSchema),false);
 const validationA=await checkValidationARequest({...input,consent:true},fixed.caseId),response=await generateComplete({...input,consent:true},{generate:async()=>dataUrl(png())}),responseSchema=spec.paths['/api/v1/complete-thumbnail'].post.responses['200'].content['application/json'].schema;assert.ok(matches({...response,validationA},responseSchema));assert.equal(matches({...response,validationA:{...validationA,feedbackUsed:true}},responseSchema),false);
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

test('required-atmosphere fixture and 100-example provenance agree with OpenAPI and reject missing or invented claims',async()=>{
 const f=JSON.parse(await readFile(new URL('../docs/fixtures/required-reference-intent.json',import.meta.url),'utf8')),v={...f.input,consent:true},now=new Date('2026-10-31T00:00:00Z');assert.equal(f.source,'synthetic');assert.equal(matches(v,schema),true);
 const records=Array.from({length:100},(_,i)=>{const videoId='t'+String(i).padStart(10,'0'),sha256=(i+1).toString(16).padStart(64,'0');return {videoId,metadata:{videoId,channelId:'UC'+String(i).padStart(22,'0'),verification:'youtube_data_api',viewCount:'1000001',durationSeconds:400,publishedAt:'2026-10-01T00:00:00Z',checkedAt:now.toISOString()},asset:{sha256},observation:{thumbnailSha256:sha256,genres:['travel'],moods:['calm'],material:'multi_photo',typography:'Synthetic upright serif',layout:'Synthetic layout '+i,when:'Synthetic space',avoid:'No invented people'},imageUse:{generationAllowed:false}};});
 const references={store:{snapshot:async()=>({catalog:{records}})},now},response=await generateComplete(v,{references,generate:async()=>dataUrl(png())}),responseSchema=spec.paths['/api/v1/complete-thumbnail'].post.responses['200'].content['application/json'].schema;
 assert.equal(response.generation_version,f.generationVersion);assert.equal(response.referenceContext.poolSize,f.expected.poolSize);assert.equal(matches(response,responseSchema),true);
 for(const visualIntent of [undefined,'','   ']){const value={...v,visualIntent};if(visualIntent===undefined)delete value.visualIntent;assert.equal(matches(value,schema),false);assert.throws(()=>validateComplete(value));}
 for(const change of [{poolSize:99},{poolSha256:'bad'},{visualIntentSha256:'bad'},{version:'thumbnail-reference-context-1.0.0'}])assert.equal(matches({...response,referenceContext:{...response.referenceContext,...change}},responseSchema),false);
 const {consent,...plain}=v,fixed=await freezeValidationA(plain,{references});assert.equal(matches(fixed,{$ref:'#/components/schemas/ValidationACase'}),true);
 const receipt=await checkValidationARequest(v,fixed.caseId,{references});assert.equal(matches({...response,validationA:receipt},responseSchema),true);
});

test('four-photo fixture, case1.2 and five-asset diagnostics agree with OpenAPI while legacy caps remain enforced',async()=>{
 const f=JSON.parse(await readFile(new URL('../docs/fixtures/four-photos.json',import.meta.url),'utf8')),v={...f.input,consent:true};assert.equal(f.source,'synthetic');assert.equal(matches(v,schema),true);validateComplete(v);
 const bad={...v,additionalImageDataUrls:[...v.additionalImageDataUrls,dataUrl(png(1280,720,[1,2,3,255]))]};assert.equal(matches(bad,schema),false);assert.throws(()=>validateComplete(bad));
 const response=await generateComplete(v,{generate:async()=>dataUrl(png())}),responseSchema=spec.paths['/api/v1/complete-thumbnail'].post.responses['200'].content['application/json'].schema;assert.equal(response.generation_version,f.generationVersion);assert.equal(matches(response,responseSchema),true);assert.equal(matches({...response,sourcePhotoSha256s:response.sourcePhotoSha256s.slice(1)},responseSchema),false);
 const fixed=await freezeValidationA(f.input);assert.equal(fixed.version,f.expected.fixedVersion);assert.equal(matches(fixed,{$ref:'#/components/schemas/ValidationACase'}),true);assert.equal(matches({...fixed,version:'validation-a-case-1.1.0'},{$ref:'#/components/schemas/ValidationACase'}),false);
 const entry=await createEntry(f.input,response),bundle=comparisonBundle({groups:[entry.group],images:[entry.image],reviews:[]},entry.group.id),request=await diagnosticRequest(bundle),diagnostic=analyzePngAssets(request);assert.equal(matches(request,{$ref:'#/components/schemas/CompleteDiagnosticRequest'}),true);assert.equal(matches(diagnostic,{$ref:'#/components/schemas/CompleteDiagnosticResponse'}),true);
 assert.equal(matches({...request,assetVersion:'image-assets-1.1.0'},{$ref:'#/components/schemas/CompleteDiagnosticRequest'}),false);assert.equal(matches({...diagnostic,analysisVersion:'complete-png-diagnostics-0.1.2'},{$ref:'#/components/schemas/CompleteDiagnosticResponse'}),false);
});
