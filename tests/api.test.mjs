import test from 'node:test';
import assert from 'node:assert/strict';
import {makeServer} from '../backend/server.mjs';
import {generate} from '../backend/generation/index.mjs';
import {score} from '../backend/scoring/index.mjs';
import {readFile} from 'node:fs/promises';
test('HTTP pipeline and invalid requests',async t=> {
 const server=makeServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const post=(body,type='application/json')=>fetch(url+'/api/v1/thumbnails',{method:'POST',headers:{'Content-Type':type},body});
 const response=await post(JSON.stringify({title:'初心者のAI入門',genre:'education'}));assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.mode,'demo');assert.equal(data.candidates.length,3);
 assert.equal(new Set(data.candidates.map(c=>c.id)).size,3);
 for(const c of data.candidates){assert.equal(c.width,1280);assert.equal(c.height,720);assert.match(c.imageDataUrl,/^data:image\/svg\+xml;base64,/);assert.ok(c.assessment.overall>=0&&c.assessment.overall<=100);assert.equal(c.assessment.kind,'layout_heuristic');}
 assert.ok(data.candidates.every((c,i,a)=>i===0||a[i-1].assessment.overall>=c.assessment.overall));
 for(const body of ['{}','null','[]','{"title":""}','{"title":"x","genre":"bad"}',JSON.stringify({title:'長'.repeat(61)}),'broken'])assert.equal((await post(body)).status,400);
 assert.equal((await post('{}','text/plain')).status,415);
 assert.equal((await post(JSON.stringify({title:'x'.repeat(17000)}))).status,413);
 assert.equal((await fetch(url+'/api/v1/thumbnails')).status,405);
 assert.equal((await fetch(url+'/.env')).status,404);
 assert.equal((await fetch(url+'/')).status,200);
 assert.equal((await fetch(url+'/api/v1/health')).status,200);
});
test('XML escaping and readability penalty',async()=> {
 const [candidate]=await generate({title:'<script>&"',genre:'other'});
 const svg=Buffer.from(candidate.imageDataUrl.split(',')[1],'base64').toString();assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));
 const short=await score(candidate,{});const [long]=await generate({title:'長'.repeat(60),genre:'other'});assert.ok((await score(long,{})).overall<short.overall);
});
test('Claude fixtures work independently with scoring',async()=> {
 const response=JSON.parse(await readFile(new URL('../data/fixtures/response.json',import.meta.url)));
 for(const c of response.candidates) assert.deepEqual(await score(c,response.input),c.assessment);
 const requests=JSON.parse(await readFile(new URL('../data/fixtures/requests.json',import.meta.url)));
 for(const input of requests) assert.equal((await generate(input)).length,3);
});
test('unsupported provider fails explicitly',async()=> {
 const previous=process.env.GENERATION_PROVIDER;process.env.GENERATION_PROVIDER='not-implemented';
 try {await assert.rejects(generate({title:'test',genre:'other'}),error=>error.status===503&&error.code==='PROVIDER_UNAVAILABLE');}
 finally {if(previous===undefined)delete process.env.GENERATION_PROVIDER;else process.env.GENERATION_PROVIDER=previous;}
});
