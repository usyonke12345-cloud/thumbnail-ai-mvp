import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createEntry,createLegacyEntry,addToGallery,validateQualityReview,comparisonBundle,MAX_IMAGES,parseCostUsd,validateObservation,recordObservation,gallerySummary,comparisonReport,chooseDesign} from '../frontend/complete-gallery-model.js';
import {createCompleteGallery} from '../frontend/complete-gallery.js';
import {makeServer} from '../backend/server.mjs';
function png(w,h,variant=0){const b=Buffer.alloc(25);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);b[24]=variant;return `data:image/png;base64,${b.toString('base64')}`;}
const payload={title:'私の動画',brief:'写真の人物の紹介',headline:'MY VIDEO',composition:'text_left',imageDataUrl:png(1280,720),consent:true};
const result={apiVersion:'1',mode:'ai_complete',width:1536,height:864,generation_version:'ai-complete-0.1.2',imageDataUrl:png(1536,864),limitations:['未採点です。']};
const empty=()=>({groups:[],images:[],reviews:[]});
test('real PNG groups hold the sent photo and exact text while allowing different composition intents',async()=>{
 const a=await createEntry({...payload,apiKey:'never-save'},result,{id:'a',elapsedMs:2500}),b=await createEntry({...payload,composition:'text_right'},{...result,imageDataUrl:png(1536,864,1)},{id:'b'});
 assert.equal(a.group.id,b.group.id);assert.equal(a.group.sourceImageDataUrl,payload.imageDataUrl);assert.equal(a.image.elapsedMs,2500);assert.ok(!JSON.stringify(a).includes('never-save'));assert.ok(!JSON.stringify(a).includes('consent'));
 for(const change of [{title:'別の動画'},{brief:'別の内容'},{headline:'MY NEW VIDEO'},{imageDataUrl:png(1280,720,1)}])assert.notEqual((await createEntry({...payload,...change},result)).group.id,a.group.id);
 for(const bad of [{...result,imageDataUrl:'https://example.com/x.png'},{...result,imageDataUrl:png(1,1)}])await assert.rejects(()=>createEntry(payload,bad));
});
test('gallery keeps previous results, rejects replacement and capacity overflow, and deduplicates restored PNGs',async()=>{
 let state=empty();for(let i=0;i<MAX_IMAGES;i++)state=addToGallery(state,await createEntry(payload,{...result,imageDataUrl:png(1536,864,i)},{id:`image-${i}`}));
 assert.equal(state.images.length,MAX_IMAGES);assert.equal(state.groups.length,1);
 const duplicate=addToGallery(state,await createLegacyEntry(result));assert.equal(duplicate.added,false);assert.equal(duplicate.groups.length,1);
 const next=await createEntry(payload,{...result,imageDataUrl:png(1536,864,99)});assert.throws(()=>addToGallery(state,next),/いっぱい/);assert.equal(state.images.length,MAX_IMAGES);
 const changed=structuredClone(next);changed.group.input.headline='changed';assert.throws(()=>addToGallery(state,changed),/変更できません/);
});
test('old completed drafts have unknown input rather than inheriting the current photo or headline',async()=>{
 const legacy=await createLegacyEntry({imageDataUrl:result.imageDataUrl});assert.equal(legacy.group.input,null);assert.equal(legacy.group.sourceImageDataUrl,null);assert.equal(legacy.image.composition,null);assert.equal(legacy.image.result.generation_version,null);
 assert.notEqual(legacy.group.id,(await createEntry(payload,result)).group.id);
});
test('all rejected remains a human decision, width is recorded, and adding an image makes an earlier review stale',async()=>{
 const entry=await createEntry(payload,result,{id:'a'}),state=addToGallery(empty(),entry),review={version:1,groupId:entry.group.id,recordedAt:new Date().toISOString(),decision:'none_acceptable',imageId:null,reason:'主役が違う',issues:['subject'],displayWidths:[{imageId:'a',width:168}]};
 validateQualityReview(review,entry.group,state.images);state.reviews.push(review);const bundle=comparisonBundle(state,entry.group.id);assert.equal(bundle.assessment,null);assert.equal(bundle.reviewCoversAllImages,true);assert.equal(bundle.review.imageId,null);
 for(const change of [{decision:'selected',imageId:'missing'},{displayWidths:[]},{issues:['subject','subject']}])assert.throws(()=>validateQualityReview({...review,...change},entry.group,state.images));
 const more=addToGallery(state,await createEntry({...payload,composition:'text_top'},{...result,imageDataUrl:png(1536,864,1)},{id:'b'}));assert.equal(comparisonBundle(more,entry.group.id).reviewCoversAllImages,false);assert.equal(more.reviews[0].reason,review.reason);
});
function documentFixture(){
 const all=node=>[node,...node.children.flatMap(all)];
 const document={createElement(tag){return {tag,children:[],textContent:'',value:'',style:{},dataset:{},attrs:{},events:{},checked:false,disabled:false,append(...nodes){this.children.push(...nodes);},prepend(...nodes){this.children.unshift(...nodes);},replaceChildren(...nodes){this.children=[...nodes];},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.events[k]=fn;},querySelectorAll(tag){return all(this).filter(x=>x!==this&&x.tag===tag);},getBoundingClientRect(){return {width:168};}};}};
 const root=document.createElement('section');return {document,root,find:predicate=>all(root).find(predicate)};
}
function storageFixture(){let state=empty(),rejectReview=false;return {get state(){return state;},set rejectReview(value){rejectReview=value;},async load(){return structuredClone(state);},async add(entry){state=addToGallery(state,entry);return structuredClone(state);},async observe(id,value){if(rejectReview)throw new Error('保存容量が足りません。');state=recordObservation(state,id,value);return structuredClone(state);},async review(review){if(rejectReview)throw new Error('保存容量が足りません。');validateQualityReview(review,state.groups.find(x=>x.id===review.groupId),state.images);state.reviews=[review];return structuredClone(state);},async remove(id){state={groups:state.groups.filter(x=>x.id!==id),images:state.images.filter(x=>x.groupId!==id),reviews:[]};return structuredClone(state);},async clear(){state=empty();return structuredClone(state);}};}
test('gallery reloads real images, saves all rejected, and explains failures next to the save button',async()=>{
 const dom=documentFixture(),storage=storageFixture(),downloads=[];
 const app=createCompleteGallery({...dom,storage,download:(...args)=>downloads.push(args),confirm:()=>true});await app.ready;
 await app.remember(payload,result,{id:'a'});await app.remember({...payload,composition:'text_right'},{...result,imageDataUrl:png(1536,864,1)},{id:'b'});
 const form=dom.find(x=>x.attrs['aria-label']==='AI完成画像の品質確認'),save=form.children.find(x=>x.type==='submit'),decision=dom.find(x=>x.attrs['aria-label']==='AI完成画像の使いたい案');
 await form.events.submit({preventDefault(){}});assert.match(form.children.at(-2).textContent,/選んで/);assert.equal(storage.state.reviews.length,0);
 decision.value='none';await form.events.submit({preventDefault(){}});assert.equal(storage.state.reviews[0].decision,'none_acceptable');assert.equal(storage.state.reviews[0].displayWidths.length,2);assert.ok(storage.state.reviews[0].displayWidths.every(x=>x.width===168));assert.equal(save.disabled,false);
 const reloaded=documentFixture(),next=createCompleteGallery({...reloaded,storage,download:()=>{},confirm:()=>true});await next.ready;assert.equal(reloaded.find(x=>x.attrs['aria-label']==='AI完成画像の使いたい案').value,'none');assert.equal(reloaded.root.querySelectorAll('img').length,3);
 storage.rejectReview=true;await form.events.submit({preventDefault(){}});assert.match(form.children.at(-2).textContent,/容量/);assert.equal(save.disabled,false);
 await dom.find(x=>x.textContent==='写真・完成画像・比較記録のJSONを保存').events.click();assert.equal(JSON.parse(downloads[0][1]).assessment,null);
 await next.clear();assert.equal(storage.state.images.length,0);
});
test('unknown costs stay null, confirmed zero stays zero, and invalid monetary/save inputs are rejected',async()=>{
 assert.equal(parseCostUsd('  '),null);assert.equal(parseCostUsd('0'),0);assert.equal(parseCostUsd('0.010000'),.01);
 for(const value of ['-0.01','1e-2','0.0000001','1,000','1000.000001','NaN','Infinity'])assert.throws(()=>parseCostUsd(value));
 const entry=await createEntry(payload,result,{id:'a'}),state=addToGallery(empty(),entry),record={version:1,recordedAt:new Date().toISOString(),costUsd:null,pngSave:'unknown'};
 assert.equal(validateObservation({...record,apiKey:'never-save'}).apiKey,undefined);
 for(const change of [{costUsd:NaN},{costUsd:Infinity},{costUsd:-1},{costUsd:.0000001},{pngSave:'yes'},{recordedAt:'invalid'}])assert.throws(()=>recordObservation(state,'a',{...record,...change}));
 assert.throws(()=>recordObservation(state,'missing',record));assert.equal(state.images[0].observation,undefined);
 const next=recordObservation(state,'a',{...record,costUsd:0,pngSave:'saved'});assert.equal(gallerySummary(next).cost.confirmedTotalUsd,0);assert.equal(gallerySummary(state).cost.confirmedTotalUsd,null);assert.equal(next.groups[0].sourceImageDataUrl,payload.imageDataUrl);
});
test('PNG reports count each retained image once and distinguish one-image confirmation, comparison and stale choices',async()=>{
 let state=empty();for(let i=0;i<3;i++)state=addToGallery(state,await createEntry(payload,{...result,imageDataUrl:png(1536,864,i)},{id:`image-${i}`,elapsedMs:[1000,2000,9000][i]}));
 state=recordObservation(state,'image-0',{version:1,recordedAt:new Date().toISOString(),costUsd:.1,pngSave:'saved'});state=recordObservation(state,'image-1',{version:1,recordedAt:new Date().toISOString(),costUsd:.2,pngSave:'failed'});
 const review={version:1,groupId:state.groups[0].id,recordedAt:new Date().toISOString(),decision:'selected',imageId:'image-0',reason:'使いたい',issues:[],displayWidths:state.images.map(x=>({imageId:x.id,width:246}))};state.reviews.push(review);
 let summary=gallerySummary(state);assert.equal(summary.cost.confirmedTotalUsd,.3);assert.equal(summary.cost.unknownImages,1);assert.deepEqual(summary.pngSave,{saved:1,failed:1,unknown:1});assert.equal(summary.generationTime.medianMs,2000);assert.equal(summary.generationTime.p95Ms,9000);assert.equal(summary.comparedGroups,1);
 state=recordObservation(state,'image-0',{version:1,recordedAt:new Date().toISOString(),costUsd:.12,pngSave:'saved'});assert.equal(gallerySummary(state).cost.confirmedTotalUsd,.32);
 const report=comparisonReport(state);assert.equal(report.sets.length,1);assert.equal(report.sets[0].version,'complete-comparison-1.2.0');assert.equal(report.sets[0].assessment,null);assert.equal(report.sets[0].images[0].observation.costUsd,.12);
 state=addToGallery(state,await createEntry(payload,{...result,imageDataUrl:png(1536,864,3)},{id:'image-3'}));summary=gallerySummary(state);assert.equal(summary.staleReviews,1);assert.equal(summary.comparedGroups,0);assert.equal(summary.generationTime.unknown,1);
 const solo=addToGallery(empty(),await createEntry(payload,result,{id:'solo'}));solo.reviews.push({...review,groupId:solo.groups[0].id,imageId:'solo',displayWidths:[{imageId:'solo',width:168}]});assert.equal(gallerySummary(solo).singleImageReviews,1);assert.equal(gallerySummary(solo).comparedGroups,0);
});
test('manual cost/save observations survive reload, report all groups, and expose errors beside their own button',async()=>{
 const dom=documentFixture(),storage=storageFixture(),downloads=[],app=createCompleteGallery({...dom,storage,download:(...args)=>downloads.push(args)});await app.ready;
 await app.remember(payload,result,{id:'a'});await app.remember({...payload,title:'別の動画'},{...result,imageDataUrl:png(1536,864,1)},{id:'b'});
 const form=dom.find(x=>x.attrs['aria-label']==='案Aの実費と保存結果'),cost=dom.find(x=>x.attrs['aria-label']==='案Aの実費USD'),pngSave=dom.find(x=>x.attrs['aria-label']==='案AのPNG保存結果');
 assert.equal(cost.value,'');assert.equal(pngSave.value,'unknown');cost.value='bad';await form.events.submit({preventDefault(){}});assert.match(form.children.at(-2).textContent,/USD/);assert.equal(storage.state.images[1].observation,undefined);
 cost.value='.01';await form.events.submit({preventDefault(){}});assert.equal(storage.state.images[1].observation,undefined);
 cost.value='0.01';pngSave.value='saved';await form.events.submit({preventDefault(){}});assert.equal(storage.state.images[1].observation.costUsd,.01);assert.equal(storage.state.images[0].observation,undefined);
 const reloaded=documentFixture(),next=createCompleteGallery({...reloaded,storage,download:()=>{}});await next.ready;assert.equal(reloaded.find(x=>x.attrs['aria-label']==='案Aの実費USD').value,'0.01');assert.equal(reloaded.find(x=>x.attrs['aria-label']==='案AのPNG保存結果').value,'saved');
 storage.rejectReview=true;cost.value='0.02';await form.events.submit({preventDefault(){}});assert.match(form.children.at(-2).textContent,/容量/);assert.equal(storage.state.images[1].observation.costUsd,.01);assert.equal(form.children.find(x=>x.type==='submit').disabled,false);
 await dom.find(x=>x.textContent==='全組の画像・記録・集計JSONを保存').events.click();const report=JSON.parse(downloads[0][1]);assert.equal(report.sets.length,2);assert.equal(report.summary.cost.confirmedTotalUsd,.01);assert.equal(report.summary.pngSave.saved,1);assert.equal(report.summary.pngSave.unknown,1);
});
const editor=await readFile(new URL('../frontend/editor.js',import.meta.url),'utf8'),handler=editor.slice(editor.lastIndexOf("document.querySelector('#ai-complete').addEventListener")).split('// Draft lifecycle')[0];
test('PNG diagnosis succeeds or explains failure without changing the images, review or manual generation',async()=>{
 const dom=documentFixture(),storage=storageFixture();let calls=0,fail=false;
 const app=createCompleteGallery({...dom,storage,download:()=>{},diagnose:async(b,id)=>{calls++;assert.equal(b.images[0].id,id);if(fail)throw new Error('offline');return {assets:[{assetId:'a',status:'analyzed',width:1536,height:864,luminance:{mean:.2},nearlyUniform:false}],images:[{imageId:id,assetId:'a'}]};}});await app.ready;await app.remember(payload,result,{id:'a'});
 const inspect=dom.find(x=>x.textContent==='このPNGを無料で診断');await inspect.events.click();assert.equal(calls,1);assert.equal(inspect.disabled,false);assert.match(inspect.children.length?inspect.textContent:dom.root.querySelectorAll('p').find(x=>x.textContent.includes('PNG診断：')).textContent,/未評価/);
 fail=true;await inspect.events.click();assert.equal(inspect.disabled,false);assert.ok(dom.root.querySelectorAll('p').some(x=>x.textContent.includes('offline')&&x.textContent.includes('保持')));assert.equal(storage.state.images.length,1);assert.equal(storage.state.reviews.length,0);
});
test('anonymous evaluator and declared provenance persist; unconfirmed permissions are never inferred',async()=>{
 const dom=documentFixture(),storage=storageFixture(),app=createCompleteGallery({...dom,storage,download:()=>{}});await app.ready;await app.remember(payload,result,{id:'a'});await app.remember(payload,{...result,imageDataUrl:png(1536,864,1)},{id:'b'});
 const form=dom.find(x=>x.attrs['aria-label']==='AI完成画像の品質確認');dom.find(x=>x.attrs['aria-label']==='AI完成画像の使いたい案').value='none';await form.events.submit({preventDefault(){}});assert.equal(storage.state.reviews[0].context.titlePermissionConfirmed,false);assert.equal(gallerySummary(storage.state).collection.authorizedRealComparisons,0);
 dom.find(x=>x.attrs['aria-label']==='AI完成画像のタイトル出典').value='original';dom.find(x=>x.attrs['aria-label']==='タイトルの利用確認').checked=true;dom.find(x=>x.attrs['aria-label']==='写真の利用確認').checked=true;await form.events.submit({preventDefault(){}});assert.equal(gallerySummary(storage.state).collection.authorizedRealComparisons,1);
 const reload=documentFixture(),next=createCompleteGallery({...reload,storage,download:()=>{}});await next.ready;assert.equal(reload.find(x=>x.attrs['aria-label']==='AI完成画像の評価者ID').value,'r01');assert.equal(reload.find(x=>x.attrs['aria-label']==='写真の利用確認').checked,true);
});
function paidFixture({archiveFails=false,saveFails=false,requestFails=false}={}){
 let callback,calls=0,shown=0,remembered=null,archived=0;const old=structuredClone(result),nodes={};
 for(const id of ['#ai-title','#ai-brief','#ai-composition','#ai-headline-mode','#ai-design','#ai-consent','#clear-draft','#ai-source','#ai-complete'])nodes[id]={value:'',checked:false,disabled:false,addEventListener:(name,fn)=>callback=fn,replaceChildren(){}};
 nodes['#ai-title'].value=payload.title;nodes['#ai-brief'].value=payload.brief;nodes['#ai-composition'].value=payload.composition;nodes['#ai-headline-mode'].value='manual';nodes['#ai-design'].value='auto';nodes['#ai-consent'].checked=true;
 const scope={document:{querySelector:s=>nodes[s],createElement:tag=>tag==='canvas'?{getContext:()=>({drawImage(){}}),toDataURL:()=>payload.imageDataUrl}:{}},layout:{value:'single'},photos:[{naturalWidth:1280,naturalHeight:720}],settings:[{zoom:1,x:.5,y:.5}],headline:{value:payload.headline},aiStatus:{textContent:''},completedResult:old,completeGallery:{async nextDesign(){return 'photo_focus';},async rememberLegacy(){archived++;if(archiveFails)throw new Error('保存できない');},async remember(p,d){if(saveFails)throw new Error('容量不足');remembered={p,d};}},cropPlacement:()=>({x:0,y:0,width:1280,height:720}),performance:{now:()=>100},AbortController,setTimeout:()=>1,clearTimeout(){},showCompleted(data){shown++;scope.completedResult=data;},scheduleDraft(){},async checkAIStatus(){},async fetch(){calls++;nodes['#ai-title'].value='Changed while waiting';return {ok:!requestFails,json:async()=>requestFails?{error:{message:'生成APIエラー'}}:{...result,imageDataUrl:png(1536,864,2)}};}};
 vm.runInNewContext(handler,scope);return {scope,nodes,calls:()=>calls,shown:()=>shown,remembered:()=>remembered,archived:()=>archived,run:()=>callback({currentTarget:nodes['#ai-complete']})};
}
test('one manual paid request archives the old PNG and records the sent inputs rather than later edits',async()=>{const app=paidFixture();await app.run();assert.equal(app.calls(),1);assert.equal(app.archived(),1);assert.equal(app.shown(),1);assert.equal(app.remembered().p.title,payload.title);assert.equal(app.remembered().p.imageDataUrl,payload.imageDataUrl);assert.equal(app.nodes['#ai-consent'].checked,false);});
test('archive failures make no paid request; provider failures preserve the old output; gallery failures keep the successful PNG',async()=>{
 const archive=paidFixture({archiveFails:true});await archive.run();assert.equal(archive.calls(),0);assert.equal(archive.shown(),0);assert.equal(archive.nodes['#ai-complete'].disabled,false);
 const failed=paidFixture({requestFails:true});await failed.run();assert.equal(failed.calls(),1);assert.equal(failed.shown(),0);assert.equal(failed.scope.completedResult.imageDataUrl,result.imageDataUrl);
 const quota=paidFixture({saveFails:true});await quota.run();assert.equal(quota.calls(),1);assert.equal(quota.shown(),1);assert.match(quota.scope.aiStatus.textContent,/生成できましたが、比較保存に失敗/);assert.match(quota.scope.aiStatus.textContent,/ファイルに保存/);
});

test('automatic headlines ignore the unused manual text and one manual click makes just one paid request',async()=>{
 const app=paidFixture();app.nodes['#ai-headline-mode'].value='auto';app.scope.headline.value='';await app.run();assert.equal(app.calls(),1);assert.equal(app.remembered().p.headline,null);assert.equal(app.remembered().p.headlineMode,'auto');assert.equal(app.remembered().p.design,'photo_focus');
 const manual=paidFixture();manual.scope.headline.value='';await manual.run();assert.equal(manual.calls(),0);assert.match(manual.scope.aiStatus.textContent,/見出しも必要/);
 const blocked=paidFixture();blocked.scope.completeGallery.nextDesign=async()=>{throw new Error('履歴を読めない');};await blocked.run();assert.equal(blocked.calls(),0);assert.match(blocked.scope.aiStatus.textContent,/履歴を読めない/);
});

test('automatic headline and explicit text stay in separate groups; successful designs rotate and restore from stored history',async()=>{
 const auto={...payload,headline:null,headlineMode:'auto'},manual=await createEntry(payload,result),automatic=await createEntry(auto,result);assert.notEqual(manual.group.id,automatic.group.id);assert.equal(automatic.group.input.headline,null);
 let state=empty();const directions=[];for(let i=0;i<3;i++){const design=await chooseDesign(state,auto);directions.push(design);state=addToGallery(state,await createEntry({...auto,design},{...result,imageDataUrl:png(1536,864,i)},{id:`auto-${i}`}));}
 assert.equal(new Set(directions).size,3);assert.equal(await chooseDesign(structuredClone(state),auto),directions[0]);assert.equal(comparisonBundle(state,state.groups[0].id).version,'complete-comparison-1.3.0');
 assert.equal(await chooseDesign(state,{...auto,title:'別の内容'}),await chooseDesign(empty(),{...auto,title:'別の内容'}));
 const dom=documentFixture(),storage=storageFixture(),app=createCompleteGallery({...dom,storage});await app.ready;await app.remember({...auto,design:'photo_focus'},result,{id:'one'});assert.equal(await app.nextDesign(auto),'editorial');assert.ok(dom.root.querySelectorAll('p').some(x=>x.textContent.includes('実際の文言は画像で確認')));
});
test('gallery modules are served as static assets without exposing stored private records',async()=>{
 const server=makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 try{for(const path of ['/complete-gallery.js','/complete-gallery-model.js','/complete-gallery-store.js']){const response=await fetch(url+path);assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');}assert.equal((await fetch(url+'/thumbnail-complete-gallery')).status,404);assert.match(await (await fetch(url+'/editor')).text(),/id="complete-comparison"/);}finally{await new Promise(resolve=>server.close(resolve));}
});
