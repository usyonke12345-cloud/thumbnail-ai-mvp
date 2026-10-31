import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAdditionalPhoto,createMultiPhotoInput} from '../frontend/multi-photo.js';
import {png,dataUrl} from './helpers/complete-png.mjs';
const photos=[20,80,140].map(c=>png(1280,720,[c,c+10,c+20,255]));
const entry=i=>({file:new File([photos[i]],'photo-'+i+'.png',{type:'image/png'}),imageDataUrl:dataUrl(photos[i])});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function dom(){
 const nodes=[],document={createElement(tag){const n={tag,children:[],textContent:'',style:{},events:{},setAttribute(){},addEventListener(k,fn){this.events[k]=fn;},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;}};nodes.push(n);return n;}};
 return {document,root:document.createElement('section'),nodes};
}
test('native PNG keeps exact bytes and portrait normalization contains the whole photo with balanced padding',async()=>{
 let revoked=0,draws=[];const URL={createObjectURL:()=> 'blob:synthetic',revokeObjectURL:()=>revoked++},Image=class{naturalWidth=1280;naturalHeight=720;async decode(){}};
 const original=entry(0).file,result=await normalizeAdditionalPhoto(original,{Image,URL,document:{createElement(){throw Error('native PNG should not be redrawn');}}});assert.equal(result.file,original);assert.equal(result.imageDataUrl,entry(0).imageDataUrl);assert.equal(revoked,1);
 const Portrait=class{naturalWidth=600;naturalHeight=1200;async decode(){}},document={createElement:()=>({getContext:()=>({clearRect(){},drawImage(...v){draws.push(v);}}),toDataURL:()=>entry(1).imageDataUrl})};
 await normalizeAdditionalPhoto(new File(['jpeg'],'portrait.jpg',{type:'image/jpeg'}),{Image:Portrait,URL,document});assert.deepEqual(draws[0].slice(1),[460,0,360,720]);assert.equal(revoked,2);
 await assert.rejects(()=>normalizeAdditionalPhoto(original,{Image:class{async decode(){throw Error('decode failed');}},URL,document}),/decode failed/);assert.equal(revoked,3);
});
test('photo picker limits total count, removes one photo and guards loading, busy and paid generation snapshots',async()=>{
 const d=dom(),wait=deferred();let count=0,busy=false,changes=0;
 const app=createMultiPhotoInput({...d,decode:async()=>{count++;return count===1?await wait.promise:entry(count-1);},verify:async()=>{},isBusy:()=>busy,onChange:()=>changes++}),input=d.nodes.find(n=>n.tag==='input');
 input.files=[entry(0).file];const loading=input.events.change();assert.equal(input.disabled,true);assert.throws(()=>app.capture(),/読み込み/);wait.resolve(entry(0));await loading;assert.equal(changes,1);
 busy=true;input.files=[entry(1).file];await input.events.change();assert.equal(count,1);busy=false;await input.events.change();assert.equal(app.capture().length,2);assert.equal(input.disabled,false);
 input.files=[entry(2).file];await input.events.change();assert.equal(app.capture().length,3);assert.equal(count,3);assert.equal(input.disabled,true);
 input.files=[entry(0).file];await input.events.change();assert.equal(app.capture().length,3);assert.equal(count,3);
 let remove=d.nodes.filter(n=>n.tag==='button').at(-1);app.setLocked(true);await remove.events.click();assert.equal(app.capture().length,3);app.setLocked(false);remove=d.nodes.filter(n=>n.tag==='button').at(-1);await remove.events.click();assert.equal(app.capture().length,2);assert.equal(input.disabled,false);
 app.clear();assert.equal(app.capture().length,0);
});
test('a failed multi-file selection preserves the previous photo and commits none of the new selection',async()=>{
 const d=dom();let n=0;const app=createMultiPhotoInput({...d,verify:async()=>{},decode:async()=>{if(++n%2===0)throw Error('bad second file');return entry(1);}});const input=d.nodes.find(x=>x.tag==='input');
 input.files=[entry(1).file,entry(2).file];await input.events.change();assert.equal(app.capture().length,0);assert.match(d.nodes.at(6)?.textContent??d.nodes.find(x=>x.tag==='p'&&x.textContent.includes('bad second'))?.textContent??'',/bad second/);
 await app.restore([entry(0)]);input.files=[entry(1).file,entry(2).file];await input.events.change();assert.equal(app.capture()[0].imageDataUrl,entry(0).imageDataUrl);
});
test('restoration cancels an earlier file decode; reset cancels an unfinished restore and failed restore keeps prior sources',async()=>{
 const d=dom(),upload=deferred(),restore=deferred();let verification=0;
 const app=createMultiPhotoInput({...d,decode:()=>upload.promise,verify:()=>++verification===1?restore.promise:Promise.reject(Error('bad restore'))}),input=d.nodes.find(x=>x.tag==='input');
 input.files=[entry(0).file];const selected=input.events.change(),restoring=app.restore([entry(1)]);upload.resolve(entry(0));await selected;assert.throws(()=>app.capture(),/読み込み/);restore.resolve();await restoring;assert.equal(app.capture()[0].imageDataUrl,entry(1).imageDataUrl);
 await assert.rejects(()=>app.restore([entry(2)]),/bad restore/);assert.equal(app.capture()[0].imageDataUrl,entry(1).imageDataUrl);
 const another=dom(),pause=deferred(),a=createMultiPhotoInput({...another,verify:()=>pause.promise});const pending=a.restore([entry(1)]);a.clear();pause.resolve();await pending;assert.equal(a.capture().length,0);
});
