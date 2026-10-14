import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {createCompleteShareZip,validateCompleteImport} from '../frontend/complete-png-transfer.js';
import {createEntry,comparisonReport,addToGallery} from '../frontend/complete-gallery-model.js';
import {bundle,png,dataUrl} from './helpers/complete-png.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=promisify(execFile);
const tempRoot=resolve(tmpdir());
function filesFromZip(bytes){
 const end=bytes.length-22;assert.equal(bytes.readUInt32LE(end),0x06054b50);assert.equal(bytes.readUInt16LE(end+20),0);
 let cursor=bytes.readUInt32LE(end+16);const files=new Map(),count=bytes.readUInt16LE(end+10);
 assert.equal(cursor+bytes.readUInt32LE(end+12),end);
 for(let i=0;i<count;i++){
  assert.equal(bytes.readUInt32LE(cursor),0x02014b50);assert.equal(bytes.readUInt16LE(cursor+10),0);
  const nameBytes=bytes.readUInt16LE(cursor+28),extraBytes=bytes.readUInt16LE(cursor+30),commentBytes=bytes.readUInt16LE(cursor+32),size=bytes.readUInt32LE(cursor+24),offset=bytes.readUInt32LE(cursor+42);
  const name=bytes.subarray(cursor+46,cursor+46+nameBytes).toString('utf8');assert.match(name,/^(assets\/[a-f0-9]{64}\.png|[a-zA-Z0-9.-]+)$/);assert.ok(!files.has(name));
  assert.equal(bytes.readUInt32LE(offset),0x04034b50);assert.equal(bytes.readUInt16LE(offset+8),0);assert.equal(bytes.readUInt32LE(offset+18),size);assert.equal(bytes.readUInt32LE(offset+22),size);
  assert.equal(bytes.subarray(offset+30,offset+30+bytes.readUInt16LE(offset+26)).toString('utf8'),name);
  const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);files.set(name,bytes.subarray(start,start+size));
  cursor+=46+nameBytes+extraBytes+commentBytes;
 }
 assert.equal(cursor,end);return files;
}
async function reportFixture(){
 const sets=[await bundle(),await bundle({title:'Second synthetic fixture',count:1,review:false})];
 const state={groups:sets.map(x=>x.group),images:sets.flatMap(x=>x.images),reviews:sets.flatMap(x=>x.review?[x.review]:[])};
 return comparisonReport(state,{exportedAt:'2026-10-11T00:00:00.000Z'});
}
async function extract(files){
 const directory=await mkdtemp(join(tempRoot,'thumbnail-share-'));
 for(const [name,bytes] of files){const path=join(directory,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
 return directory;
}
async function cleanup(directory){
 const target=resolve(directory);
 assert.equal(dirname(target).toLowerCase(),tempRoot.toLowerCase());assert.ok(basename(target).startsWith('thumbnail-share-'));
 await rm(target,{recursive:true,force:true});
}
test('share ZIP deduplicates PNG bytes while preserving all group identities, reviews and an exact restorable report',async()=>{
 const report=await reportFixture(),before=structuredClone(report),result=await createCompleteShareZip(report),files=filesFromZip(Buffer.from(await result.blob.arrayBuffer()));
 assert.deepEqual(report,before);assert.equal(result.blob.type,'application/zip');assert.equal(result.images,3);assert.equal(result.groups,2);assert.equal(result.assets,3);
 assert.equal([...files.keys()].filter(x=>x.startsWith('assets/')).length,3);
 const manifest=JSON.parse(files.get('transfer-manifest.json')),compact=files.get('report-with-asset-references.json').toString('utf8');
 assert.ok(!compact.includes('data:image/png;base64,'));assert.equal(hash(files.get('report-with-asset-references.json')),manifest.compactReport.sha256);
 for(const asset of manifest.assets){assert.equal(hash(files.get(asset.path)),asset.sha256);assert.equal(files.get(asset.path).length,asset.bytes);}
 assert.deepEqual(JSON.parse(files.get('summary.json')),report.summary);assert.deepEqual(JSON.parse(files.get('human-reviews.jsonl').toString('utf8').trim()),report.sets[0].review);
 const directory=await extract(files);
 try{
  await run(process.execPath,[join(directory,'restore-report.mjs')]);
  const restored=await readFile(join(directory,'complete-comparison-report.restored.json'));
  assert.equal(restored.toString('utf8'),JSON.stringify(report,null,2));assert.equal(hash(restored),manifest.sourceReport.sha256);await validateCompleteImport(JSON.parse(restored));
  await run(process.execPath,[join(directory,'restore-report.mjs')]); // identical existing output is safe
 }finally{await cleanup(directory);}
});
test('title-only and image-only legacy records survive sharing; preview escapes user content and makes no requests',async()=>{
 let state={groups:[],images:[],reviews:[]};
 const entry=await createEntry({title:'<script>alert(1)</script>',brief:'',headline:null,headlineMode:'auto',composition:'auto',design:'auto',visualIntent:'<img src="https://example.com/x">',imageDataUrl:dataUrl(png(1280,720))},{imageDataUrl:dataUrl(png()),generation_version:'ai-complete-0.4.2'},{id:'title-only'});
 state=addToGallery(state,entry);const report=comparisonReport(state),result=await createCompleteShareZip(report),files=filesFromZip(Buffer.from(await result.blob.arrayBuffer())),html=files.get('preview.html').toString('utf8');
 assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;')&&!html.includes('<script>'));
 assert.ok(html.includes('&lt;img src=&quot;https://example.com/x&quot;&gt;')&&!html.includes('src="https://'));
 assert.ok(html.includes('未記録')&&html.includes('未採点')&&html.includes('補足なし')&&!html.includes('fetch('));
 const compact=JSON.parse(files.get('report-with-asset-references.json'));assert.equal(compact.sets[0].version,'complete-comparison-1.5.0');assert.equal(compact.sets[0].group.input.brief,'');assert.equal(compact.sets[0].group.input.headline,null);assert.equal(compact.sets[0].review,null);
 const {createLegacyEntry}=await import('../frontend/complete-gallery-model.js');const legacy=addToGallery({groups:[],images:[],reviews:[]},await createLegacyEntry({imageDataUrl:dataUrl(png())},{id:'legacy'}));
 const old=await createCompleteShareZip(comparisonReport(legacy)),oldFiles=filesFromZip(Buffer.from(await old.blob.arrayBuffer()));assert.equal(old.assets,1);assert.equal(JSON.parse(oldFiles.get('report-with-asset-references.json')).sets[0].group.input,null);
});
test('invalid image references and mismatching hashes cannot be exported as a valid share ZIP',async()=>{
 const report=await reportFixture(),before=structuredClone(report);report.sets[0].images[0].imageSha256='0'.repeat(64);
 await assert.rejects(()=>createCompleteShareZip(report),/SHA-256/);assert.deepEqual(report.sets[1],before.sets[1]);
 await assert.rejects(()=>createCompleteShareZip({version:report.version,kind:report.kind,assessment:null,sets:[]}),/比較JSON/);
});
test('restoration refuses corrupted PNGs, corrupted records, traversal paths and replacement of a different report',async()=>{
 const result=await createCompleteShareZip(await reportFixture()),files=filesFromZip(Buffer.from(await result.blob.arrayBuffer())),manifest=JSON.parse(files.get('transfer-manifest.json'));
 for(const change of ['png','record','path','existing']){
  const directory=await extract(files);
  try{
   if(change==='png')await writeFile(join(directory,manifest.assets[0].path),'broken PNG');
   if(change==='record')await writeFile(join(directory,'report-with-asset-references.json'),'{}');
   if(change==='path'){const changed=structuredClone(manifest);changed.assets[0].path='../outside.png';await writeFile(join(directory,'transfer-manifest.json'),JSON.stringify(changed));}
   if(change==='existing')await writeFile(join(directory,'complete-comparison-report.restored.json'),'keep this file');
   await assert.rejects(()=>run(process.execPath,[join(directory,'restore-report.mjs')]));
   if(change==='existing')assert.equal(await readFile(join(directory,'complete-comparison-report.restored.json'),'utf8'),'keep this file');
   else await assert.rejects(()=>access(join(directory,'complete-comparison-report.restored.json')));
  }finally{await cleanup(directory);}
 }
});
