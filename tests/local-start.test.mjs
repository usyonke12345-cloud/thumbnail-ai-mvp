import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeServer} from '../backend/server.mjs';
import {createServer} from 'node:http';
const run=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url)),temporary=resolve(tmpdir()),env={...process.env,OPENAI_API_KEY:'fake-startup-key-not-for-api',OPENAI_IMAGE_ENABLED:'false',GENERATION_PROVIDER:'mock',OPENAI_MAX_CALLS:'1',OPENAI_TIMEOUT_MS:'120000'};
test('doctor masks keys, rejects invalid options and reuses an existing app without changing its call budget',async()=>{
 const folder=await mkdtemp(join(temporary,'thumbnail-start-')),envFile=join(folder,'test.env');await writeFile(envFile,'OPENAI_API_KEY=fake-startup-key-not-for-api\nOPENAI_IMAGE_ENABLED=false\n');
 const server=makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 try{
  const result=await run(process.execPath,['scripts/start-local.mjs','--check','--port',String(port),'--config-file',envFile],{cwd:root,env});assert.ok(!result.stdout.includes(env.OPENAI_API_KEY));const state=JSON.parse(result.stdout);assert.equal(state.existingThumbnailServer,true);assert.equal(state.portBusy,true);assert.equal(state.calls,0);
  const reused=await run(process.execPath,['scripts/start-local.mjs','--port',String(port),'--config-file',envFile],{cwd:root,env});assert.match(reused.stdout,/既に起動/);assert.equal((await (await fetch(`http://127.0.0.1:${port}/api/v1/health`)).json()).completeGeneration.calls,0);
  await assert.rejects(()=>run(process.execPath,['scripts/start-local.mjs','--check','--port','invalid','--config-file',envFile],{cwd:root,env}));
 }finally{await new Promise(resolve=>server.close(resolve));const target=resolve(folder);assert.equal(dirname(target).toLowerCase(),temporary.toLowerCase());assert.ok(basename(target).startsWith('thumbnail-start-'));await rm(target,{recursive:true,force:true});}
});
test('doctor reports foreign port conflicts without stopping the other application',async()=>{
 const other=createServer((req,res)=>{res.writeHead(404);res.end('foreign application');});await new Promise(resolve=>other.listen(0,'127.0.0.1',resolve));const port=other.address().port;
 try{await assert.rejects(()=>run(process.execPath,['scripts/start-local.mjs','--port',String(port),'--config-file','missing-test-env'],{cwd:root,env}),e=>e.stderr.includes('別のアプリ'));assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(),'foreign application');}finally{await new Promise(resolve=>other.close(resolve));}
});
