import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createAttemptHistory} from '../frontend/attempt-history.js';
import {png,dataUrl} from './helpers/complete-png.mjs';
const source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8');
const display=source.slice(source.indexOf('function showCompleted('),source.indexOf('const canvas='));
const handler=source.slice(source.indexOf('function captureAIInput()')).split('// Draft lifecycle')[0];
const old={imageDataUrl:dataUrl(png()),generation_version:'ai-complete-0.6.1',limitations:[]};
const latest={imageDataUrl:dataUrl(png(1536,864,[80,100,120,255])),generation_version:'ai-complete-0.7.0',limitations:[]};
function app(){
 let callback,calls=0,fail=true,saveFails=false,response=latest;const nodes={};
 for(const id of ['ai-result','ai-source','ai-title','ai-brief','ai-headline-mode','ai-design','ai-composition','ai-visual-intent','ai-consent','ai-complete','clear-draft','project-name'])nodes['#'+id]={children:[],value:'',checked:false,disabled:false,replaceChildren(...children){this.children=children;},addEventListener(type,fn){callback=fn;}};
 Object.assign(nodes['#ai-title'],{value:'Artificial story'});nodes['#ai-headline-mode'].value='auto';nodes['#ai-design'].value=nodes['#ai-composition'].value='auto';
 const notice=()=>nodes['#ai-result'].children.find(n=>n.id==='ai-result-status');
 const scope={document:{querySelector:id=>id==='#ai-result-status'?notice():nodes[id],createElement:tag=>tag==='canvas'?{getContext:()=>({drawImage(){}}),toDataURL:()=>dataUrl(png(1280,720))}:{tag,children:[],textContent:'',setAttribute(){}}},completedResult:null,createImageSaveControls(){},downloadLocal(){},feedbackText:()=>'',activeRevision:null,validationA:{record:()=>null,headers:async()=>({})},layout:{value:'single'},photos:[{naturalWidth:1280,naturalHeight:720}],settings:[{zoom:1,x:.5,y:.5}],cropPlacement:()=>({x:0,y:0,width:1280,height:720}),headline:{value:''},aiStatus:{textContent:''},completeGallery:{rememberLegacy:async()=>{},preflight:async()=>{},remember:async()=>{if(saveFails)throw new Error('Synthetic storage failure');}},performance,AbortController,setTimeout,clearTimeout,scheduleDraft(){},checkAIStatus:async()=>{},fetch:async()=>{calls++;assert.match(notice().textContent,/生成中.*前回/);return new Response(JSON.stringify(fail?{error:{message:'Synthetic API failure'}}:response),{status:fail?502:200});}};
 runInNewContext(display+handler,scope);
 return {scope,nodes,notice,show:(data,state)=>scope.showCompleted(data,state),setResponse:(data,{failed=false,storageFailure=false}={})=>{response=data;fail=failed;saveFails=storageFailure;},calls:()=>calls,click:async()=>{nodes['#ai-consent'].checked=true;await callback({currentTarget:nodes['#ai-complete']});}};
}
test('a failed paid request keeps the restored PNG visibly labelled as previous, rather than claiming it is a newly generated result',async()=>{
 const a=app();a.show(old,'restored');assert.match(a.notice().textContent,/保存されていた.*今回新しく生成した画像ではありません/);assert.match(a.notice().textContent,/0\.6\.1/);
 await a.click();assert.equal(a.calls(),1);assert.equal(a.scope.completedResult.imageDataUrl,old.imageDataUrl);assert.match(a.notice().textContent,/成功を確認できていません.*前回/);assert.match(a.notice().textContent,/0\.6\.1/);assert.equal(a.nodes['#ai-result'].children.find(n=>n.tag==='a').href,old.imageDataUrl);assert.match(a.scope.aiStatus.textContent,/Synthetic API failure/);
});
test('only a successful API response receives the current-result label and identical bytes are called out without an automatic retry',async()=>{
 const a=app();a.show(old,'restored');a.setResponse(latest);await a.click();assert.equal(a.calls(),1);assert.match(a.notice().textContent,/今回APIから受け取った完成画像/);assert.match(a.notice().textContent,/0\.7\.0/);assert.equal(a.scope.completedResult.imageDataUrl,latest.imageDataUrl);
 await a.click();assert.equal(a.calls(),2);assert.match(a.notice().textContent,/前回の完成画像と同じファイル内容/);assert.equal(a.scope.completedResult.imageDataUrl,latest.imageDataUrl);
});
test('gallery save failure still identifies the new API image, while an imported draft is labelled as restored',async()=>{
 const a=app();a.show(old,'restored');a.setResponse(latest,{storageFailure:true});await a.click();assert.equal(a.calls(),1);assert.match(a.notice().textContent,/今回APIから受け取った.*比較一覧への保存に失敗/);assert.match(a.notice().textContent,/0\.7\.0/);assert.equal(a.nodes['#ai-result'].children.find(n=>n.tag==='a').href,latest.imageDataUrl);
 assert.match(source,/if\(draft\.result\)showCompleted\(draft\.result,'restored'\)/);
});
test('attempt export reads the latest stored attempt without writes or images, and refuses a stale export when storage cannot be read',async()=>{
 const document={createElement:tag=>({tag,children:[],events:{},textContent:'',append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},setAttribute(){},addEventListener(name,fn){this.events[name]=fn;}})},root=document.createElement('section'),downloads=[];let records=[],fail=false,writes=0;
 const history=createAttemptHistory({root,document,storage:{load:async()=>{if(fail)throw new Error('Synthetic read failure');return records;},put:async()=>{writes++;}},download:(...args)=>downloads.push(args)});await history.ready;
 records=[{version:1,id:'another-tab',startedAt:'2026-10-18T00:00:00Z',finishedAt:'2026-10-18T00:00:05Z',status:'api_error',title:'Synthetic title',projectName:'Synthetic project',elapsedMs:5000,imageReturned:false,costUsd:null,error:'Synthetic API error',parentImageId:null}];
 await history.exportJson();assert.equal(writes,0);assert.equal(downloads[0][0],'complete-generation-attempts.json');const exported=JSON.parse(downloads[0][1]);assert.equal(exported.records[0].id,'another-tab');assert.equal(exported.summary.counts.api_error,1);assert.equal(exported.summary.costUsd,null);assert.doesNotMatch(downloads[0][1],/imageDataUrl|data:image/);
 fail=true;await assert.rejects(()=>history.exportJson(),/Synthetic read failure/);assert.equal(downloads.length,1);assert.equal(writes,0);
});
test('the export button next to paid generation saves only the attempt JSON, prevents double clicks and leaves generation untouched',async()=>{
 const block=source.slice(source.indexOf('const exportAttempts='),source.indexOf('createEditorTools(',source.indexOf('const exportAttempts=')));let button,inserted,exports=0,fail=false,resolveExport;
 const link={tag:'a'},aiStatus={children:[],textContent:'',replaceChildren(...items){this.children=items;}},scope={document:{createElement:()=>button={events:{},disabled:false,addEventListener(type,fn){this.events[type]=fn;}},querySelector:id=>{assert.equal(id,'#ai-complete');return {after(node){inserted=node;}};}},aiStatus,attemptHistory:{exportJson:async()=>{exports++;if(fail)throw new Error('Synthetic export error');await new Promise(r=>resolveExport=r);return link;}},fetch:()=>assert.fail('Export must not contact the server')};
 runInNewContext(block,scope);assert.equal(inserted,button);assert.equal(button.type,'button');assert.match(button.textContent,/生成エラー確認用/);
 const pending=button.events.click();await button.events.click();assert.equal(exports,1);assert.equal(button.disabled,true);resolveExport();await pending;assert.equal(button.disabled,false);assert.match(aiStatus.children[0],/complete-generation-attempts\.json/);assert.equal(aiStatus.children[1],link);
 fail=true;await button.events.click();assert.equal(button.disabled,false);assert.match(aiStatus.textContent,/Synthetic export error/);
});
