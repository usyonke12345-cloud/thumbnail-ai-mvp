import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {toDataUrl,fromDataUrl,hashBytes} from '../frontend/local-archive.js';
import {png,dataUrl} from './helpers/complete-png.mjs';
const source=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8');
const capture=source.slice(source.indexOf('async function captureAIInput()'),source.indexOf('function updateCompletedResultStatus('));
const handler=source.slice(source.indexOf('async function captureAIInput()')).split('// Draft lifecycle')[0];
const original=png(1280,720,[10,20,30,255]),raster=dataUrl(png(1280,720,[40,50,60,255]));
function app({file=new Blob([original],{type:'image/png'}),zoom=1,width=1280,revision=null,fullHandler=false}={}){
 let callback,calls=0,sent;const nodes={};
 for(const id of ['ai-title','ai-brief','ai-headline-mode','ai-design','ai-visual-intent','ai-composition','ai-reference-mode','ai-consent','ai-complete','clear-draft','project-name','ai-source','revision-instruction'])nodes['#'+id]={value:'',checked:false,disabled:false,textContent:'',replaceChildren(){},addEventListener:(event,fn)=>callback=fn};
 Object.assign(nodes['#ai-title'],{value:'人工の夕日動画'});nodes['#ai-headline-mode'].value='auto';nodes['#ai-design'].value=nodes['#ai-composition'].value=nodes['#ai-reference-mode'].value='auto';nodes['#ai-consent'].checked=true;
 const scope={toDataUrl,fromDataUrl,hashBytes,Blob,Uint8Array,DataView,activeRevision:revision,storedFiles:[file,null],layout:{value:'single'},photos:[{naturalWidth:width,naturalHeight:720}],settings:[{zoom,x:.5,y:.5}],headline:{value:''},cropPlacement:()=>({x:0,y:0,width:1280,height:720}),document:{querySelector:id=>nodes[id],createElement:tag=>tag==='canvas'?{getContext:()=>({drawImage(){}}),toDataURL:()=>raster}:{textContent:''}},validationA:{record:()=>null,headers:async()=>({})},aiStatus:{textContent:''},completedResult:null,completeGallery:{preflight:async()=>{},remember:async()=>{}},performance,AbortController,setTimeout,clearTimeout,showCompleted(){},scheduleDraft(){},checkAIStatus:async()=>{},fetch:async(url,options)=>{calls++;sent=JSON.parse(options.body);return new Response(JSON.stringify({imageDataUrl:dataUrl(png()),generation_version:'synthetic-test',limitations:[]}));}};
 runInNewContext(fullHandler?handler:capture,scope);
 return {scope,nodes,calls:()=>calls,sent:()=>sent,click:()=>callback({currentTarget:nodes['#ai-complete']})};
}

test('an uncropped native-size PNG is sent byte-for-byte; crop, size, JPEG and revision keep their existing paths',async()=>{
 const a=app();assert.deepEqual(Buffer.from(fromDataUrl((await a.scope.captureAIInput()).imageDataUrl)),original);
 for(const options of [{zoom:1.2},{width:1920},{file:new Blob([original],{type:'image/jpeg'})},{file:new Blob(['not a PNG'],{type:'image/png'})}])assert.equal((await app(options).scope.captureAIInput()).imageDataUrl,raster);
 const revision={sourceImageDataUrl:dataUrl(png(1280,720,[1,2,3,255])),imageDataUrl:dataUrl(png()),parentImageId:'parent'};
 assert.equal((await app({revision}).scope.captureAIInput()).imageDataUrl,revision.sourceImageDataUrl);
});

test('reading the original source locks paid dispatch before await and freezes text while the file is being read',async()=>{
 let release;const file={type:'image/png',size:original.length,arrayBuffer:()=>new Promise(resolve=>release=resolve)},a=app({file,fullHandler:true});
 const first=a.click();assert.equal(a.nodes['#ai-complete'].disabled,true);assert.equal(a.calls(),0);
 a.nodes['#ai-title'].value='変更された入力';await a.click();assert.equal(a.calls(),0);
 release(Uint8Array.from(original).buffer);await first;assert.equal(a.calls(),1);assert.equal(a.sent().title,'人工の夕日動画');assert.deepEqual(Buffer.from(fromDataUrl(a.sent().imageDataUrl)),original);assert.equal(a.nodes['#ai-complete'].disabled,false);assert.equal(a.nodes['#ai-consent'].checked,false);
});

test('source file read failure re-enables controls and records no paid attempt',async()=>{
 const a=app({fullHandler:true,file:{type:'image/png',size:100,arrayBuffer:async()=>{throw new Error('Synthetic file read failure');}}});
 await a.click();assert.equal(a.calls(),0);assert.equal(a.nodes['#ai-complete'].disabled,false);assert.equal(a.nodes['#clear-draft'].disabled,false);assert.match(a.scope.aiStatus.textContent,/file read failure/);
});
