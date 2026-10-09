import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {analyzePngAssets} from '../backend/analysis/complete-png.mjs';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {validateCompleteBundle,diagnosticRequest} from '../frontend/complete-png-transfer.js';
import {decodePng} from '../backend/scoring/png.mjs';
import {makeServer} from '../backend/server.mjs';
import {png,asset,reference,bundle,dataUrl} from './helpers/complete-png.mjs';
const run=promisify(execFile);
const request=(assets=[asset(png())],images=[reference()])=>({assetVersion:'image-assets-1.0.0',assets,images});
const openapi=JSON.parse(await readFile(new URL('../shared/openapi.json',import.meta.url),'utf8'));
function validate(value,s,path='$'){
 if(s.$ref)return validate(value,openapi.components.schemas[s.$ref.split('/').at(-1)],path);
 const errors=[],type=value===null?'null':Array.isArray(value)?'array':Number.isInteger(value)?'integer':typeof value;
 if(s.type&&!([s.type].flat().includes(type)||type==='integer'&&[s.type].flat().includes('number')))return [`${path}: type`];
 if('const'in s&&value!==s.const)errors.push(`${path}: const`);
 if(s.enum&&!s.enum.includes(value))errors.push(`${path}: enum`);
 if(typeof value==='number'&&(!Number.isFinite(value)||value<(s.minimum??-Infinity)||value>(s.maximum??Infinity)))errors.push(`${path}: number`);
 if(typeof value==='string'&&(value.length<(s.minLength??0)||value.length>(s.maxLength??Infinity)||s.pattern&&!new RegExp(s.pattern).test(value)))errors.push(`${path}: string`);
 if(Array.isArray(value)){if(value.length<(s.minItems??0)||value.length>(s.maxItems??Infinity)||s.uniqueItems&&new Set(value).size!==value.length)errors.push(`${path}: array`);value.forEach((x,i)=>errors.push(...validate(x,s.items,`${path}[${i}]`)));}
 if(value&&type==='object'){for(const key of s.required??[])if(!Object.hasOwn(value,key))errors.push(`${path}: missing ${key}`);for(const [key,x]of Object.entries(value))if(s.properties?.[key])errors.push(...validate(x,s.properties[key],`${path}.${key}`));else if(s.additionalProperties===false)errors.push(`${path}: extra ${key}`);}
 return errors;
}
test('PNG diagnostics request, fixture and successful/unavailable responses match their separate OpenAPI contract',async()=>{
 const fixture=JSON.parse(await readFile(new URL('../docs/fixtures/complete-diagnostics.json',import.meta.url),'utf8'));
 for(const body of [fixture.request,request(),request([asset(png().subarray(0,-12))])]){assert.deepEqual(validate(body,openapi.components.schemas.CompleteDiagnosticRequest),[]);assert.deepEqual(validate(analyzePngAssets(body),openapi.components.schemas.CompleteDiagnosticResponse),[]);}
 assert.deepEqual(analyzePngAssets(fixture.request),fixture.response);
 assert.ok(validate({...fixture.response,assessment:{}},openapi.components.schemas.CompleteDiagnosticResponse).length);
 assert.ok(validate({...fixture.request,assets:[]},openapi.components.schemas.CompleteDiagnosticRequest).length);
 assert.ok(validate({...fixture.response,assets:[{...fixture.response.assets[0],qualityScore:100}]},openapi.components.schemas.CompleteDiagnosticResponse).length);
 assert.equal(openapi.paths['/api/v1/complete-diagnostics'].post.requestBody.content['application/json'].schema.$ref,'#/components/schemas/CompleteDiagnosticRequest');
 assert.equal(openapi.components.schemas.Assessment.properties.kind.const,'layout_heuristic');
});

test('shared PNGs decode once and return diagnostics without invented text, quality or background',()=>{
 let calls=0;const a=asset(png()),same={...a,assetId:'source',role:'source_photo'};
 const result=analyzePngAssets(request([a,same],[reference('complete','a','source'),reference('complete','b','source')]),{decode:bytes=>{calls++;return decodePng(bytes);}});
 assert.equal(calls,1);assert.equal(result.decodedImages,1);assert.equal(result.assessment,null);assert.equal(result.assets.length,2);assert.ok(result.assets.every(x=>x.status==='analyzed'&&x.nearlyUniform));
 for(const image of result.images){assert.equal(image.qualityScore,null);assert.equal(image.renderedText,null);assert.equal(image.backgroundAssetId,null);assert.ok(image.unevaluated.includes('text_contrast'));}
});
test('asset integrity and roles are checked before decoding',()=>{
 const a=asset(png());let calls=0;
 for(const change of [{sha256:'0'.repeat(64)},{byteLength:a.byteLength+1},{mimeType:'image/jpeg'},{dataUrl:'https://example.com/private.png'},{width:-1},{apiKey:'do-not-accept'}])assert.throws(()=>analyzePngAssets(request([{...a,...change}]),{decode:()=>calls++}));
 assert.equal(calls,0);
 for(const ref of [{backgroundAssetId:'complete'},{renderedTextVerified:true},{textRegions:[]},{sourcePhotoAssetId:'complete'},{generationVersion:undefined}])assert.throws(()=>analyzePngAssets(request([a],[{...reference(),...ref}])));
 assert.throws(()=>analyzePngAssets(request([a,{...a,assetId:'unused'}])));
 assert.throws(()=>analyzePngAssets(request(Array.from({length:5},(_,i)=>({...a,assetId:`a${i}`})))));
});
test('corruption, unsupported transparency/method and actual dimension mismatch are unavailable rather than scores',()=>{
 const broken=png().subarray(0,-12),cases=[asset(broken),asset(png(1536,864,[0,0,0,255],{method:1})),asset(png(1536,864,[0,0,0,255],{transparency:true})),asset(png(),{width:1535})];
 for(const a of cases){const result=analyzePngAssets(request([a]));assert.equal(result.assets[0].status,'unavailable');assert.equal(result.assets[0].luminance,null);assert.equal(result.images[0].qualityScore,null);assert.ok(result.assets[0].reasons.length);}
 const transparent=analyzePngAssets(request([asset(png(1536,864,[0,0,0,0]))]));assert.equal(transparent.assets[0].status,'analyzed');assert.equal(transparent.assets[0].luminance,null);assert.equal(transparent.assets[0].nearlyUniform,null);
});
test('comparison import checks frozen identities, supports older records, and rejects changed source, title and image',async()=>{
 const b=await bundle(),checked=await validateCompleteBundle(b);assert.equal(checked.assessment,null);
 const reordered=structuredClone(b);reordered.group.input={headline:b.group.input.headline,sourceSha256:b.group.input.sourceSha256,brief:b.group.input.brief,title:b.group.input.title};assert.deepEqual((await validateCompleteBundle(reordered)).group.input,checked.group.input);
 for(const mutate of [x=>x.group.input.title='Changed',x=>x.group.sourceImageDataUrl=dataUrl(png(1280,720,[255,255,255,255])),x=>x.images[0].imageSha256='0'.repeat(64),x=>x.images[0].result.imageDataUrl='https://example.com/png',x=>x.review.context.reviewerId='A real personal name',x=>x.review.displayWidths.push({imageId:'missing',width:246})]){const bad=structuredClone(b);mutate(bad);await assert.rejects(()=>validateCompleteBundle(bad));}
 const old=await bundle({context:false});old.version='complete-comparison-1.1.0';old.apiKey='never-copy';old.images[0].result.apiKey='never-copy';const normalized=await validateCompleteBundle(old);assert.equal(normalized.review.context,undefined);assert.ok(!JSON.stringify(normalized).includes('never-copy'));
 await assert.rejects(()=>diagnosticRequest(b,[b.images[0].id,b.images[0].id]));
});
test('multiple exports deduplicate images, update observations, preserve unknown cost and identify incomplete comparison',async()=>{
 const b=await bundle(),analysis=createCompleteReviewAnalysis();await analysis.consume(b);const later=structuredClone(b);later.group.capturedAt='2026-10-10T00:02:00.000Z';await analysis.consume(later);let out=analysis.finish();assert.equal(out.images.length,2);assert.equal(out.assets.length,3);assert.equal(out.progress.completedHumanComparisons,1);assert.equal(out.progress.authorizedRealComparisons,0);assert.equal(out.summary.cost.confirmedTotalUsd,null);assert.equal(out.scoringAgreement,null);assert.equal(out.groups[0].capturedAt,b.group.capturedAt);
 const newer=structuredClone(b);newer.images[0].observation={version:1,recordedAt:'2026-10-10T00:02:00Z',costUsd:0,pngSave:'saved'};await analysis.consume(newer);await analysis.consume(b);out=analysis.finish();assert.equal(out.summary.cost.confirmedTotalUsd,0);assert.equal(out.summary.cost.unknownImages,1);assert.equal(out.summary.pngSave.saved,1);assert.equal(out.progress.completedHumanComparisons,1);
 const stale=await bundle({title:'Different photo and title',sourcePhoto:dataUrl(png(1280,720,[10,20,30,255]))});stale.review.displayWidths=stale.review.displayWidths.slice(0,1);await analysis.consume(stale);assert.equal(analysis.finish().progress.pending.at(-1).reason,'stale_review');
 const changed=structuredClone(newer);changed.images[0].observation.costUsd=.01;await assert.rejects(()=>analysis.consume(changed),/同時刻/);
});
test('twenty synthetic regression records are separate from twenty authorized real comparisons',async()=>{
 const analysis=createCompleteReviewAnalysis();for(let i=0;i<20;i++)await analysis.consume(await bundle({title:`Synthetic-${i}`}));const out=analysis.finish();assert.equal(out.progress.completedHumanComparisons,20);assert.equal(out.progress.authorizedRealComparisons,0);assert.equal(out.humanOutcomes.allRejected,20);assert.equal(out.progress.byReviewer.r01,20);assert.equal(out.assets.length,3);assert.equal(out.summary.images,40);
 const old=createCompleteReviewAnalysis();await old.consume(await bundle({context:false}));await old.consume(await bundle({title:'One only',count:1}));assert.deepEqual(old.finish().progress.pending.map(x=>x.reason),['reviewer_missing','need_multiple_images']);
});
test('CLI writes exact PNG files and private records, merges repeated exports without double counting',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'thumbnail-complete-'));try{
  const b=await bundle();await writeFile(join(temp,'input.json'),JSON.stringify(b));const output=join(temp,'result');const result=await run(process.execPath,['scripts/analyze-complete-comparisons.mjs','--out',output,join(temp,'input.json'),join(temp,'input.json')],{cwd:new URL('..',import.meta.url),maxBuffer:1024*1024});assert.equal(JSON.parse(result.stdout).images,2);
  const report=JSON.parse(await readFile(join(output,'analysis.json'),'utf8'));assert.equal(report.reviews.length,1);assert.equal(report.progress.completedHumanComparisons,1);assert.ok(!JSON.stringify(report).includes('data:image'));
  for(const a of report.assets)assert.equal((await stat(join(output,a.path))).size,a.byteLength);
  assert.ok((await readFile(join(output,'README.txt'),'utf8')).includes('非公開'));
 }finally{await rm(temp,{recursive:true,force:true});}
});
test('HTTP diagnostics route and module work locally and do not consume a paid generation slot',async()=>{
 const server=makeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;try{
  const health=async()=>await(await fetch(url+'/api/v1/health')).json(),before=await health(),b=await bundle(),body=await diagnosticRequest(b,[b.images[0].id]);
  const response=await fetch(url+'/api/v1/complete-diagnostics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);assert.equal((await response.json()).assets.length,2);assert.deepEqual((await health()).completeGeneration,before.completeGeneration);
  assert.equal((await fetch(url+'/complete-png-transfer.js')).status,200);
  assert.equal((await fetch(url+'/api/v1/complete-diagnostics',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);
  assert.equal((await fetch(url+'/api/v1/complete-diagnostics')).status,405);
 }finally{await new Promise(r=>server.close(r));}
});
