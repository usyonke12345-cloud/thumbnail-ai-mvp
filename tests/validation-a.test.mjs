import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {freezeValidationA,checkValidationARequest} from '../backend/validation-a.mjs';
import {assertValidationAInput,validationAZip,createValidationA} from '../frontend/validation-a.js';
import {readZip,decodeText} from '../frontend/local-archive.js';
import {validateDraft} from '../frontend/editor-draft.js';
import {createDraftBackup,readDraftBackup} from '../frontend/editor-backup.js';
import {makeServer} from '../backend/server.mjs';
import {validateComplete} from '../backend/generation/complete.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';
import {ordinaryChatgptPrompt,validationAProtocol} from '../shared/validation-a-baseline.mjs';
const input=()=>({title:'人工タイトル：ゆっくりした旅',brief:'',visualIntent:'写真を自然に、文字も穏やかに。',headlineMode:'auto',headline:null,design:'auto',composition:'auto',imageDataUrl:dataUrl(png(1280,720))});

test('A snapshot and ZIP freeze the exact sent PNG, canonical inputs, running source hashes and model settings without consent or a generated outcome',async()=>{
 const v=input(),fixed=await freezeValidationA(v),again=await freezeValidationA({...v});assert.equal(fixed.caseId,again.caseId);assert.equal(fixed.service.feedbackUsed,false);assert.equal(fixed.service.revisionUsed,false);assert.equal(fixed.service.quality,'medium');assert.equal(fixed.service.size,'1536x864');assert.equal(fixed.service.n,1);assert.match(fixed.service.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(fixed.service.files.some(x=>x.path==='backend/generation/complete-prompt.mjs'));
 await assertValidationAInput(fixed,{...v,consent:true});const zip=await validationAZip(fixed,v.imageDataUrl),files=await readZip(new Uint8Array(await zip.arrayBuffer()));assert.deepEqual(Buffer.from(files.get('source.png')),png(1280,720));assert.deepEqual(JSON.parse(decodeText(files.get('validation-a.json'))),fixed);assert.equal(decodeText(files.get('chatgpt-prompt.txt')),ordinaryChatgptPrompt(fixed.input));assert.doesNotMatch(fixed.chatgptPrompt,/動画の内容：/);assert.equal(JSON.parse(decodeText(files.get('comparison-protocol.json'))).ordinaryBaselineMatched,true);assert.equal(fixed.input.headline,null);assert.doesNotMatch(JSON.stringify(fixed),/"consent"|OPENAI_API_KEY|"assessment"/);
 for(const change of [{title:'changed'},{visualIntent:'別の希望'},{composition:'text_top'},{design:'editorial'},{brief:'new'},{headlineMode:'manual',headline:'短い文字'},{imageDataUrl:dataUrl(png(1280,720,[1,2,3,255]))}]){await assert.rejects(()=>assertValidationAInput(fixed,{...v,...change}),/固定時と変わり/);await assert.rejects(()=>checkValidationARequest({...v,...change,consent:true},fixed.caseId),e=>e.code==='VALIDATION_A_MISMATCH');}
 for(const key of ['consent','feedback','revision'])await assert.rejects(()=>freezeValidationA({...v,[key]:null}),e=>e.code==='INVALID_VALIDATION_A');
 await assert.rejects(()=>validationAZip(fixed,dataUrl(png(1280,720,[1,2,3,255]))),/ハッシュ|固定時/);
 const modified=structuredClone(fixed);modified.service.model='changed';await assert.rejects(()=>validationAZip(modified,v.imageDataUrl),/固定ID/);
 const manual=await freezeValidationA({...v,headlineMode:'manual',headline:'旅の一日',composition:'text_right',design:'editorial'});assert.match(manual.chatgptPrompt,/サムネイルに入れる文字：「旅の一日」/);assert.doesNotMatch(manual.chatgptPrompt,/文字の配置|誌面風/);assert.match(manual.servicePrompt,/旅の一日/);
});

test('ordinary A baseline matches the PR11 short request without service instructions or invented empty context',async()=>{
 const v={...input(),title:'海辺の一日',brief:'海でビールを飲みながら話す',visualIntent:'落ち着いた旅',design:'recompose',composition:'text_right'};
 const fixed=await freezeValidationA(v);
 assert.equal(fixed.chatgptPrompt,'この写真を使って、YouTube動画のサムネイル画像を作ってください。\n横長（16:9）でお願いします。\n動画タイトル：「海辺の一日」\n動画の内容：海でビールを飲みながら話す\n仕上がりのイメージ：落ち着いた旅\n動画タイトルをもとに、サムネイルに入れる短い見出しを考えて入れてください。\n写真の人物はそのまま使ってください。');
 assert.match(fixed.servicePrompt,/PEOPLE SOURCE RULE/);assert.match(fixed.servicePrompt,/REQUIRED SPATIAL EDIT/);
 assert.doesNotMatch(fixed.chatgptPrompt,/切り抜|再配置|人物がいない|文字の配置|元写真に写っている人物だけ|REQUIRED/);
 const other=await freezeValidationA({...v,design:'auto',composition:'auto'});assert.equal(other.chatgptPrompt,fixed.chatgptPrompt);assert.notEqual(other.caseId,fixed.caseId);
 const blank=await freezeValidationA({...v,brief:'',visualIntent:''});assert.doesNotMatch(blank.chatgptPrompt,/動画の内容|仕上がりのイメージ|なし|指定なし/);
 assert.equal(validationAProtocol(fixed).comparison,'service_vs_ordinary_chatgpt');
 assert.equal(validationAProtocol(await freezeValidationA({...v,title:'あ'.repeat(61)})).pr11TitleLengthCompatible,false);
});

test('legacy detailed prompts remain unchanged on restore and ZIP export and are labelled reference-only',async()=>{
 const v=input(),legacy=structuredClone(await freezeValidationA(v));legacy.chatgptPrompt='添付写真だけを使い、人物を切り抜き、拡大・再配置してください。';
 const before=JSON.stringify(legacy),files=await readZip(new Uint8Array(await(await validationAZip(legacy,v.imageDataUrl)).arrayBuffer()));
 assert.equal(decodeText(files.get('chatgpt-prompt.txt')),legacy.chatgptPrompt);assert.deepEqual(JSON.parse(decodeText(files.get('validation-a.json'))),legacy);assert.equal(JSON.stringify(legacy),before);
 assert.equal(JSON.parse(decodeText(files.get('comparison-protocol.json'))).comparison,'reference_other_prompt');assert.match(decodeText(files.get('README.txt')),/正式A比較には含めません/);
 const nodes=[],document={createElement:tag=>{const node={tag,style:{},children:[],textContent:'',setAttribute(){},addEventListener(){},replaceChildren(...children){this.children=children;}};nodes.push(node);return node;}};
 const app=createValidationA({root:document.createElement('section'),document});app.restore(legacy);assert.deepEqual(app.record(),legacy);assert.match(nodes.find(n=>n.tag==='pre').textContent,/参考記録/);
});

test('freezing and restoring the A controller switch memory off, persist the snapshot, provide a downloadable ZIP and never generate',async()=>{
 const nodes=[],document={createElement:tag=>{const node={tag,textContent:'',style:{},events:{},children:[],setAttribute(){},addEventListener(name,fn){this.events[name]=fn;},replaceChildren(...children){this.children=children;}};nodes.push(node);return node;}},root=document.createElement('section');let switched=0,released=0,changed=0;const downloads=[],requests=[];
 const app=createValidationA({root,document,capture:async()=>({...input(),consent:true}),onFreeze:()=>switched++,onRelease:()=>released++,onChange:()=>changed++,download:(...args)=>{downloads.push(args);return document.createElement('a');},fetchImpl:async(path,options)=>{requests.push(path);return new Response(JSON.stringify(await freezeValidationA(JSON.parse(options.body))));}});
 await nodes.find(x=>x.tag==='button'&&x.textContent.includes('ZIP保存')).events.click();assert.deepEqual(requests,['/api/v1/validation-a/freeze']);assert.equal(switched,1);assert.equal(changed,1);assert.match(downloads[0][0],/^validation-a-[a-f0-9]{64}\.zip$/);assert.ok(downloads[0][1] instanceof Blob);assert.ok(app.record());
 app.restore(app.record());assert.equal(switched,2);assert.deepEqual(await app.headers({...input(),consent:true}),{'X-Validation-A-Case':app.record().caseId});await nodes.find(x=>x.textContent==='固定を解除').events.click();assert.equal(app.record(),null);assert.equal(released,1);assert.deepEqual(await app.headers(input()),{});
});

test('fixed A input survives a reload and existing draft backup, while API consent stays unset',async()=>{
 const fixed=await freezeValidationA(input()),draft=validateDraft({version:1,layout:'single',settings:[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}],files:[new Blob([png(1280,720)],{type:'image/png'}),null],validationA:fixed,feedbackSettings:{enabled:false,scope:'project',reviewerId:'r01',excluded:[]},title:input().title,consent:true});
 assert.deepEqual(draft.validationA,fixed);assert.equal(draft.feedbackSettings.enabled,false);assert.equal(draft.consent,undefined);
 const zip=await createDraftBackup(draft),restored=await readDraftBackup(new Uint8Array(await zip.arrayBuffer()));assert.deepEqual(restored.validationA,fixed);assert.equal(restored.feedbackSettings.enabled,false);assert.equal(restored.consent,undefined);
 assert.equal(validateDraft({...draft,validationA:undefined}).validationA,null);
});

test('freezing never reaches a provider; A header rejects modified input, stale build IDs, memory and revisions before paid dispatch',async()=>{
 let calls=0;const server=makeServer({complete:async body=>{validateComplete(body);calls++;return {generation_version:'test-only',imageDataUrl:dataUrl(png()),limitations:[]};}});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,body,headers={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 try{const before=await(await fetch(url+'/api/v1/health')).json(),response=await post('/api/v1/validation-a/freeze',input());assert.equal(response.status,200);const fixed=await response.json(),headers={'X-Validation-A-Case':fixed.caseId};assert.equal(calls,0);
  for(const body of [{...input(),consent:true,title:'new'},{...input(),consent:true,feedback:{}},{...input(),consent:true,revision:{}}])assert.ok([400,409].includes((await post('/api/v1/complete-thumbnail',body,headers)).status));
  assert.equal((await post('/api/v1/complete-thumbnail',{...input(),consent:true},{'X-Validation-A-Case':'validation-a-'+'0'.repeat(64)})).status,409);assert.equal(calls,0);
  const good=await post('/api/v1/complete-thumbnail',{...input(),consent:true},headers);assert.equal(good.status,200);assert.equal((await good.json()).validationA.feedbackUsed,false);assert.equal(calls,1);
  assert.equal((await post('/api/v1/complete-thumbnail',{...input(),consent:false},headers)).status,400);assert.equal(calls,1);
  assert.equal((await fetch(url+'/validation-a.js')).status,200);assert.equal((await fetch(url+'/shared/validation-a-baseline.mjs')).status,200);const after=await(await fetch(url+'/api/v1/health')).json();assert.deepEqual(after.completeGeneration,before.completeGeneration);
 }finally{await new Promise(r=>server.close(r));}
});

test('the real editor click handler skips memory in A, sends the frozen ID, and blocks changed input without a paid request',async()=>{
 const editor=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8'),handler=editor.slice(editor.indexOf('function captureAIInput()')).split('// Draft lifecycle')[0],v=input(),fixed=await freezeValidationA(v);
 let callback,requests=0,memoryReads=0;const nodes={};for(const id of ['ai-title','ai-brief','ai-visual-intent','ai-headline-mode','ai-design','ai-composition','ai-consent','ai-complete','clear-draft','ai-source','project-name'])nodes['#'+id]={value:'',checked:false,disabled:false,replaceChildren(){},addEventListener:(type,fn)=>callback=fn};
 for(const [id,key]of [['ai-title','title'],['ai-brief','brief'],['ai-visual-intent','visualIntent'],['ai-headline-mode','headlineMode'],['ai-design','design'],['ai-composition','composition']])nodes['#'+id].value=v[key];nodes['#ai-consent'].checked=true;
 const scope={activeRevision:null,validationA:{record:()=>fixed,async headers(payload){await assertValidationAInput(fixed,payload);return {'X-Validation-A-Case':fixed.caseId};}},document:{querySelector:id=>nodes[id],createElement:tag=>tag==='canvas'?{getContext:()=>({drawImage(){}}),toDataURL:()=>v.imageDataUrl}:{}},layout:{value:'single'},photos:[{naturalWidth:1280,naturalHeight:720}],settings:[{zoom:1,x:.5,y:.5}],cropPlacement:()=>({x:0,y:0,width:1280,height:720}),headline:{value:''},feedbackMemory:{prepare(){memoryReads++;throw new Error('Do not read memory');}},aiStatus:{textContent:''},completedResult:null,completeGallery:{preflight:async()=>{},remember:async()=>{}},showCompleted(){},scheduleDraft(){},checkAIStatus:async()=>{},performance,AbortController,setTimeout,clearTimeout,fetch:async(url,o)=>{requests++;assert.equal(o.headers['X-Validation-A-Case'],fixed.caseId);assert.equal(JSON.parse(o.body).feedback,undefined);return new Response(JSON.stringify({imageDataUrl:dataUrl(png()),limitations:[]}));}};
 runInNewContext(handler,scope);await callback({currentTarget:nodes['#ai-complete']});assert.equal(requests,1);assert.equal(memoryReads,0);assert.equal(nodes['#ai-consent'].checked,false);
 nodes['#ai-title'].value='changed';nodes['#ai-consent'].checked=true;await callback({currentTarget:nodes['#ai-complete']});assert.equal(requests,1);assert.match(scope.aiStatus.textContent,/固定時と変わり/);assert.equal(nodes['#clear-draft'].disabled,false);
});
