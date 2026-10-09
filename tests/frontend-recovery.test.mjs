import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../frontend/app.js',import.meta.url),'utf8');
function setup(request){
 const status={textContent:''},button={disabled:false},old={id:'old-candidate'};
 const results={children:[old],before(){},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}};
 const created=[],stored=new Map();
 const createElement=tag=>{const node={tag,value:'',children:[],setAttribute(){},append(...items){this.children.push(...items);},addEventListener(event,fn){this[event]=fn;}};created.push(node);return node;};
 let submit,timeout,cleared=false,calls=0;
 const nodes={'#form':{addEventListener:(_,fn)=>submit=fn},'#submit':button,'#status':status,'#results':results,'#mode':{},'#title':{value:'動画の作り方'},'#genre':{value:'education'}};
 const context={document:{querySelector:s=>nodes[s],createElement},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},AbortController,TypeError,setTimeout(fn,ms){assert.equal(ms,190000);timeout=fn;return 1;},clearTimeout(){cleared=true;},fetch:async(url,options)=>url.endsWith('health')?{ok:true,json:async()=>({mode:'demo'})}:(calls++,request(options,()=>timeout()))};
 vm.runInNewContext(source,context);
 return {status,button,results,old,created,stored,run:()=>submit({preventDefault(){}}),calls:()=>calls,cleared:()=>cleared};
}

test('choosing a candidate records versions and reason locally without another API call or image storage',async()=>{
 const candidate={id:'chosen',style:'bold',imageDataUrl:'data:image/svg+xml;base64,AAAA',metadata:{generation_version:'0.4.0'},assessment:{version:'0.4.0',overall:50,overallMax:100,unevaluated:['contrast'],metrics:{contrast:null,brevity:100,font:100,fit:100},reasons:[],limitations:[]}};
 const app=setup(async()=>({ok:true,json:async()=>({mode:'demo',input:{title:'動画制作',genre:'education'},candidates:[candidate],elapsedMs:10})}));
 await app.run();app.created.find(n=>n.tag==='input').value='文字が読みやすい';app.created.find(n=>n.textContent==='この案を選んで記録').click();
 const record=JSON.parse(app.stored.get('thumbnail-latest-preference-v1'));
 assert.equal(record.candidateId,'chosen');assert.equal(record.reason,'文字が読みやすい');assert.equal(record.generationVersion,'0.4.0');assert.equal(record.assessmentVersion,'0.4.0');assert.equal(app.calls(),1);assert.equal(JSON.stringify(record).includes('data:image'),false);
 assert.equal(record.candidates[0].assessment.metrics.contrast,null);
 assert.equal(record.candidates[0].generationVersion,'0.4.0');
 assert.deepEqual(app.created.find(n=>n.tag==='article').children.slice(0,3).map(n=>n.tag),['img','h2','p']);
});
test('network, provider and deadline failures retain previous candidates and permit another click',async()=>{
 for(const scenario of ['network','provider','deadline']){
  const app=setup(async(options,expire)=>{if(scenario==='network')throw new TypeError('offline');if(scenario==='deadline'){expire();assert.equal(options.signal.aborted,true);throw Object.assign(new Error(),{name:'AbortError'});}return {ok:false,json:async()=>({error:{message:'画像APIの利用上限に達しました。'}})};});
  await app.run();assert.equal(app.button.disabled,false);assert.equal(app.results.children[0],app.old);assert.equal(app.calls(),1);assert.equal(app.cleared(),true);assert.match(app.status.textContent,/前回の候補/);
  if(scenario==='deadline')assert.match(app.status.textContent,/課金済み|自動再試行/);
  await app.run();assert.equal(app.calls(),2);
 }
});
test('a second submit while pending never sends another generation request',async()=>{
 let release;const app=setup(()=>new Promise(resolve=>release=resolve));const pending=app.run();assert.equal(app.button.disabled,true);await app.run();assert.equal(app.calls(),1);
 release({ok:false,json:async()=>({error:{message:'試験用エラー'}})});await pending;assert.equal(app.button.disabled,false);
});
