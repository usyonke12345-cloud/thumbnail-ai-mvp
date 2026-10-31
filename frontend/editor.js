import {createMultiPhotoInput} from './multi-photo.js';
import {cropPlacement,fitHeadline,suggestPhotoLayouts} from './editor-layout.js';
import {loadDraft,saveDraft,deleteDraft,validateDraft} from './editor-draft.js';
import {createCompleteGallery} from './complete-gallery.js';
import {createEditorDesignGuide} from './editor-design-guide.js';
import {createImageSaveControls} from './image-save.js';
import {createEditorTools} from './editor-tools.js';
import {createAttemptHistory} from './attempt-history.js';
import {createEditorReferences} from './editor-references.js';
import {createFeedbackMemory,feedbackText} from './feedback-memory.js';
import {fromDataUrl,toDataUrl,hashBytes} from './local-archive.js';
import {createValidationA} from './validation-a.js';
import {requireVisualIntent} from '../shared/complete-designs.mjs';
let feedbackMemory=null,validationA=null;
const completeGallery=createCompleteGallery({root:document.querySelector('#complete-comparison'),onRevise:prepareRevision,onRecordsChanged:()=>feedbackMemory?.refresh()});
const storedFiles=[null,null];let completedResult=null,activeRevision=null,restoring=true,saveTimer,saveQueue=Promise.resolve();
function captureCurrentDraft(){const additionalPhotos=typeof multiPhotos!=='undefined'?multiPhotos.capture():[];return {version:1,...(additionalPhotos.length?{additionalPhotos}:{}),referenceMode:document.querySelector('#ai-reference-mode')?.value??'required',validationA:validationA?.record(),feedbackSettings:feedbackMemory?.settings(),layout:layout.value,settings,files:storedFiles,headline:headline.value,headlineMode:document.querySelector('#ai-headline-mode').value,design:document.querySelector('#ai-design').value,visualIntent:document.querySelector('#ai-visual-intent').value,title:document.querySelector('#ai-title').value,brief:document.querySelector('#ai-brief').value,composition:document.querySelector('#ai-composition').value,accent:accent.value,position:document.querySelector('#text-position').value,protect:document.querySelector('#protect-subject').value,shade:document.querySelector('#shade').value,result:completedResult,projectName:document.querySelector('#project-name').value,revision:activeRevision?{...activeRevision,instruction:document.querySelector('#revision-instruction').value}:null};}
function scheduleDraft(){if(restoring)return;clearTimeout(saveTimer);document.querySelector('#draft-status').textContent='下書きを保存しています…';saveTimer=setTimeout(()=>{saveQueue=saveQueue.catch(()=>{}).then(()=>saveDraft(validateDraft(captureCurrentDraft()))).then(()=>{document.querySelector('#draft-status').textContent='下書きをこのブラウザに保存しました。リロード後に復元できます。';}).catch(()=>{document.querySelector('#draft-status').textContent='下書きを保存できません。容量やブラウザ設定を確認し、完成PNGをファイルへ保存してください。';});},300);}
function showCompleted(data,state='received'){
 const identical=state==='received'&&completedResult?.imageDataUrl===data.imageDataUrl;
 completedResult=data;const image=document.createElement('img'),link=document.createElement('a'),note=document.createElement('p'),notice=document.createElement('p');
 notice.id='ai-result-status';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 image.src=data.imageDataUrl;image.alt='AIによる完成サムネ';link.href=data.imageDataUrl;link.download='ai-complete-thumbnail.png';link.textContent='完成PNGを保存（1536×864）';note.textContent=data.limitations.join(' ')+(data.feedbackApplied?'\n'+feedbackText(data.feedbackApplied):'');const options=document.createElement('div');createImageSaveControls({root:options,imageDataUrl:data.imageDataUrl,download:downloadLocal});document.querySelector('#ai-result').replaceChildren(notice,image,note,link,options);
 updateCompletedResultStatus(identical?'identical':state);
}
const canvas=document.querySelector('#preview'),ctx=canvas.getContext('2d'),status=document.querySelector('#editor-status');
const photos=[null,null],versions=[0,0],settings=[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}],cards=[];
const layout=document.querySelector('#layout'),headline=document.querySelector('#headline'),accent=document.querySelector('#accent');
const multiPhotos=createMultiPhotoInput({root:document.querySelector('#multi-photo-input'),isBusy:()=>document.querySelector('#clear-draft').disabled,onChange:()=>{activeRevision=null;renderRevision();document.querySelector('#ai-consent').checked=false;scheduleDraft();}});
function updateHeadlineControls(){
 const manual=document.querySelector('#ai-headline-mode').value==='manual';
 document.querySelector('#manual-headline-control').hidden=!manual;headline.disabled=!manual;
 if(manual)document.querySelector('#ai-advanced-headline').open=true;
 document.querySelector('#headline-mode-description').textContent=manual?'入力した見出しを使います。AI生成では80文字以内で指定してください。':'見出しの入力は不要です。AIが動画タイトルから短い文言を考えます。';
}
const designGuide=createEditorDesignGuide({root:document.querySelector('#ai-design-guide'),designControl:document.querySelector('#ai-design'),compositionControl:document.querySelector('#ai-composition'),intentControl:document.querySelector('#ai-visual-intent'),onSelect:()=>scheduleDraft()});
createEditorReferences({root:document.querySelector('#editor-references'),capture:()=>({title:document.querySelector('#ai-title').value,brief:document.querySelector('#ai-brief').value,visualIntent:document.querySelector('#ai-visual-intent').value,design:document.querySelector('#ai-design').value,composition:document.querySelector('#ai-composition').value,revision:!!activeRevision,sourcePhotoCount:1+multiPhotos.capture().length}),modeControl:document.querySelector('#ai-reference-mode')});
feedbackMemory=createFeedbackMemory({root:document.querySelector('#generation-feedback'),readHistory:()=>completeGallery.readForFeedback(),context:()=>({title:document.querySelector('#ai-title').value,projectName:document.querySelector('#project-name').value}),onChange:scheduleDraft});
validationA=createValidationA({root:document.querySelector('#validation-a'),capture:captureAIInput,download:downloadLocal,onChange:scheduleDraft,isBusy:()=>document.querySelector('#clear-draft').disabled,onFreeze:()=>{feedbackMemory.restore({...feedbackMemory.settings(),enabled:false});document.querySelector('#generation-feedback').disabled=true;document.querySelector('#ai-consent').checked=false;},onRelease:()=>{document.querySelector('#ai-reference-mode').value='required';document.querySelector('#generation-feedback').disabled=false;document.querySelector('#ai-consent').checked=false;}});
const aiStatus=document.createElement('p');aiStatus.setAttribute('role','status');aiStatus.setAttribute('aria-live','polite');document.querySelector('#ai-complete').after(aiStatus);
async function checkAIStatus(){
 try{const response=await fetch('/api/v1/health');if(!response.ok)throw new Error();const data=await response.json(),s=data.completeGeneration;
  const control=document.querySelector('#ai-complete');control.disabled=!s||!s.keyConfigured||!s.enabled||s.busy||s.calls>=s.maxCalls;
  control.textContent=s&&s.calls>=s.maxCalls?'生成回数の上限です（再起動が必要）':`写真からAIで完成画像1枚を作る（有料${s?`・残り${Math.max(0,s.maxCalls-s.calls)}回`:''}）`;
  aiStatus.textContent=!s?'サーバーを更新・再起動する必要があります。':!s.keyConfigured?'APIキーがサーバーで読み込まれていません。':!s.enabled?'サーバーの有料生成が無効です。':s.calls>=s.maxCalls?`生成回数の上限です（${s.calls}/${s.maxCalls}回）。費用を確認してから再起動してください。`:s.busy?'現在、別の画像を生成しています。':'API接続の設定は準備済みです。写真を選び、送信と課金の確認にチェックして生成してください。';
 }catch{aiStatus.textContent='サーバーに接続できません。起動状態を確認してください。';}
}
checkAIStatus();
function photo(image,box,setting){if(!image)return;const p=cropPlacement(image.naturalWidth,image.naturalHeight,box,setting.zoom,setting.x,setting.y);ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.width,box.height);ctx.clip();ctx.drawImage(image,p.x,p.y,p.width,p.height);ctx.restore();}
let suggestionRun=0;
async function autoLayouts(){
 const run=++suggestionRun;
 if(!photos[0]){status.textContent='まず「使う写真」を選んでください。';return;}
 layout.value='single';ctx.fillStyle='#111620';ctx.fillRect(0,0,1280,720);photo(photos[0],{x:0,y:0,width:1280,height:720},settings[0]);
 const small=document.createElement('canvas');small.width=320;small.height=180;const sample=small.getContext('2d');sample.drawImage(canvas,0,0,320,180);
 const subject=document.querySelector('#protect-subject').value;
 let regions=[],detection='顔検出は利用できません。主役の位置を指定すると、その領域を避ける案を優先します。';
 if(subject!=='none'){regions=[{x:{left:0,center:430,right:860}[subject],y:0,width:420,height:720}];detection='指定した主役の領域を避ける案を優先しています。';}
 else if(typeof window.FaceDetector==='function'){try{const faces=await new window.FaceDetector({fastMode:true}).detect(small);regions=faces.map(({boundingBox:b})=>({x:b.x*4-24,y:b.y*4-24,width:b.width*4+48,height:b.height*4+48}));detection=faces.length?`${faces.length}個の顔領域を避ける案を優先しています。`:'顔は検出できませんでした。主役の位置を指定してください。';}catch{detection='顔検出に失敗しました。主役の位置を指定してください。';}}
 if(run!==suggestionRun)return;
 const suggestions=suggestPhotoLayouts(sample.getImageData(0,0,320,180),regions),container=document.querySelector('#auto-candidates');container.replaceChildren();
 const names={left:'左',center:'中央',right:'右'};
 suggestions.forEach((choice,i)=>{
  document.querySelector('#text-position').value=choice.position;document.querySelector('#shade').value=choice.shade;draw();
  const card=document.createElement('article'),image=document.createElement('img'),title=document.createElement('h2'),button=document.createElement('button'),note=document.createElement('p');image.src=canvas.toDataURL('image/png');image.alt=`文字を${names[choice.position]}に配置した候補`;title.textContent=`案${i+1}：文字を${names[choice.position]}へ`;note.textContent=choice.overlap?'文字領域が主役の範囲に重なる候補です。調整してください。':regions.length?'文字領域は指定・検出された主役の範囲と重なりません。':'主役の位置は未確認です。';button.type='button';button.textContent='この案を編集・保存';button.addEventListener('click',()=>{document.querySelector('#text-position').value=choice.position;document.querySelector('#shade').value=choice.shade;draw();canvas.scrollIntoView({block:'center'});});card.append(title,image,note,button);container.append(card);
 });
 document.querySelector('#text-position').value=suggestions[0].position;document.querySelector('#shade').value=suggestions[0].shade;draw();
 status.textContent=`写真から配置3案を作りました。${detection} 顔の検出は髪や体全体の認識ではありません。`;
}
document.querySelector('#auto-layout').addEventListener('click',async()=>{try{await autoLayouts();}catch(error){draw();status.textContent=`配置案を作れません：${error.message}`;}});
function draw(){
 scheduleDraft();
 ctx.fillStyle='#111620';ctx.fillRect(0,0,1280,720);
 const compare=layout.value==='comparison',single=layout.value==='single';
 cards.forEach((card,i)=>{card.hidden=single?i===1:!compare&&i===0;card.querySelector('span').textContent=single?'使う写真':i===0?'左の写真':'右の写真';});
 document.querySelector('#single-controls').hidden=!single;
 const position=document.querySelector('#text-position').value;
 if(single){photo(photos[0],{x:0,y:0,width:1280,height:720},settings[0]);
  const gradient=ctx.createLinearGradient(position==='right'?1280:0,0,position==='right'?0:1280,0),opacity=Number(document.querySelector('#shade').value)/100;
  if(position==='center'){gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(.5,`rgba(0,0,0,${opacity})`);gradient.addColorStop(1,'rgba(0,0,0,0)');}
  else{gradient.addColorStop(0,`rgba(0,0,0,${opacity})`);gradient.addColorStop(.75,'rgba(0,0,0,0)');}
  ctx.fillStyle=gradient;ctx.fillRect(0,0,1280,720);
 }
 else if(compare){photo(photos[0],{x:0,y:0,width:340,height:720},settings[0]);photo(photos[1],{x:940,y:0,width:340,height:720},settings[1]);}
 else photo(photos[1],{x:650,y:0,width:630,height:720},settings[1]);
 const box=single?{x:position==='left'?55:position==='right'?675:365,y:120,width:550,height:480}:compare?{x:370,y:120,width:540,height:480}:{x:55,y:120,width:550,height:480};
 if(!headline.value.trim()){status.textContent='写真だけの無料プレビューです。AI完成画像では動画タイトルから見出しを考えます。';document.querySelector('#save-editor').disabled=!photos.some(Boolean);return;}
 try{
  const fitted=fitHeadline(headline.value,(text,size)=>{ctx.font=`900 ${size}px Arial, sans-serif`;return ctx.measureText(text).width;},box.width,box.height);
  ctx.font=`900 ${fitted.size}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=5;ctx.strokeStyle='#0b1018';
  fitted.lines.forEach((text,i)=>{const y=360+(i-(fitted.lines.length-1)/2)*fitted.size*1.18;ctx.fillStyle=i===1?accent.value:'#ffffff';ctx.strokeText(text,box.x+box.width/2,y);ctx.fillText(text,box.x+box.width/2,y);});
  status.textContent=single?'写真1枚を全面に配置します。文字の位置・暗さと切り取り位置を調整できます。':compare?'左右の写真を選んで配置を調整してください。':'右の写真を使います。左の写真は左右比較に戻すと使えます。';
  document.querySelector('#save-editor').disabled=false;
 }catch(error){status.textContent=error.message;document.querySelector('#save-editor').disabled=true;}
}
photos.forEach((_,index)=>{
 const card=document.createElement('article'),label=document.createElement('label'),name=document.createElement('span'),input=document.createElement('input');name.textContent=index===0?'左の写真':'右の写真';input.type='file';input.accept='image/png,image/jpeg,image/webp';label.append(name,input);card.append(label);cards.push(card);
 input.addEventListener('change',async()=>{
  suggestionRun++;const version=++versions[index],file=input.files[0];if(!file)return;let url;
  try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('PNG・JPEG・WebPの20MB以内の写真を選んでください。');url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();if(version!==versions[index])return;if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('4000万画素以内の写真を選んでください。');storedFiles[index]=file;photos[index]=image;activeRevision=null;renderRevision();draw();if(index===0&&layout.value==='single')await autoLayouts();}
  catch(error){if(version===versions[index])status.textContent=`写真を読み込めません：${error.message} 前の写真は保持しています。`;}
  finally{if(url)URL.revokeObjectURL(url);}
 });
 for(const [key,name,min,max]of [['zoom','拡大',100,200],['x','横の切り取り位置',0,100],['y','縦の切り取り位置',0,100]]){
  const wrap=document.createElement('label'),range=document.createElement('input');wrap.textContent=name;range.type='range';range.min=min;range.max=max;range.value=settings[index][key]*100;range.addEventListener('input',()=>{suggestionRun++;settings[index][key]=Number(range.value)/100;if(index===0&&activeRevision)delete activeRevision.sourceImageDataUrl;draw();});wrap.append(range);card.append(wrap);
 }
 document.querySelector('#photos').append(card);
});
for(const input of [layout,headline,accent,document.querySelector('#text-position'),document.querySelector('#shade'),document.querySelector('#protect-subject')])input.addEventListener('input',()=>{suggestionRun++;draw();});
document.querySelector('#save-editor').addEventListener('click',async event=>{
 const button=event.currentTarget;button.disabled=true;
 try{const handle=typeof window.showSaveFilePicker==='function'?await window.showSaveFilePicker({suggestedName:'photo-thumbnail.png',types:[{description:'PNG',accept:{'image/png':['.png']}}]}):null;
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNGを作れませんでした。')),'image/png'));
 if(handle){const writer=await handle.createWritable();try{await writer.write(blob);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}status.textContent='PNGを保存しました。';}
 else{const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='photo-thumbnail.png';link.textContent='PNGをダウンロード';status.replaceChildren(link);link.click();}}
 catch(error){status.textContent=error.name==='AbortError'?'保存をキャンセルしました。':`保存できません：${error.message}`;}finally{button.disabled=false;}
});
draw();
async function captureAIInput(){
 if(layout.value!=='single'||!photos[0])throw new Error('「1枚の写真を全面に使う」を選び、「使う写真」から写真を読み込んでください。');
 if(document.querySelector('#ai-reference-mode')?.value==='required')requireVisualIntent(document.querySelector('#ai-visual-intent').value);
 const source=document.createElement('canvas');source.width=1280;source.height=720;const c=source.getContext('2d'),p=cropPlacement(photos[0].naturalWidth,photos[0].naturalHeight,{x:0,y:0,width:1280,height:720},settings[0].zoom,settings[0].x,settings[0].y);c.drawImage(photos[0],p.x,p.y,p.width,p.height);
 const headlineMode=document.querySelector('#ai-headline-mode').value;
 const extra=typeof multiPhotos!=='undefined'?multiPhotos.capture().map(x=>x.imageDataUrl):[];
 const original=!activeRevision&&typeof storedFiles!=='undefined'&&storedFiles[0]?.type==='image/png'&&photos[0].naturalWidth===1280&&photos[0].naturalHeight===720&&settings[0].zoom===1?storedFiles[0]:null;
 // Capture text, crop and revision before awaiting the source file. Mid-read edits
 // must not change the request associated with this click.
 const payload={...(extra.length?{additionalImageDataUrls:[...extra]}:{}),title:document.querySelector('#ai-title').value,brief:document.querySelector('#ai-brief').value,headline:headlineMode==='auto'?null:headline.value,headlineMode,design:document.querySelector('#ai-design').value,visualIntent:document.querySelector('#ai-visual-intent').value,composition:document.querySelector('#ai-composition').value,...(document.querySelector('#ai-reference-mode')?{referenceMode:document.querySelector('#ai-reference-mode').value}:{}),imageDataUrl:activeRevision?.sourceImageDataUrl??source.toDataURL('image/png'),consent:true,...(activeRevision?{revision:{instruction:document.querySelector('#revision-instruction').value,parentImageId:activeRevision.parentImageId,imageDataUrl:activeRevision.imageDataUrl}}:{})};
 if(original&&original.size<=2359296){const bytes=new Uint8Array(await original.arrayBuffer());if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)&&String.fromCharCode(...bytes.slice(12,16))==='IHDR'){const view=new DataView(bytes.buffer);if(view.getUint32(16)===1280&&view.getUint32(20)===720){const raw=toDataUrl(bytes);if(raw.length<=3*1024*1024)payload.imageDataUrl=raw;}}}
 return payload;
}
function updateCompletedResultStatus(state){
 const notice=document.querySelector('#ai-result-status');if(!completedResult||!notice)return;
 const message={restored:'保存されていた完成画像を表示しています。今回新しく生成した画像ではありません。',previous:'前回の完成画像を表示しています。今回の生成結果ではありません。',working:'生成中です。表示中の画像は前回の完成画像です。',failed:'今回の生成は成功を確認できていません。表示中の画像は前回の完成画像です。',received:'今回APIから受け取った完成画像です。',identical:'今回APIから受け取った画像は、前回の完成画像と同じファイル内容です。',save_error:'今回APIから受け取った完成画像です。比較一覧への保存に失敗したため、PNGをファイルへ保存してください。'}[state];
 notice.textContent=`${message} 画像の生成版：${completedResult.generation_version??'不明'}。`;
}
document.querySelector('#ai-complete').addEventListener('click',async event=>{
 const control=event.currentTarget;if(control.disabled)return;
 if(layout.value!=='single'||!photos[0]){aiStatus.textContent='「1枚の写真を全面に使う」を選び、「使う写真」から写真を読み込んでください。';return;}
 if(document.querySelector('#ai-reference-mode')?.value==='required'&&!document.querySelector('#ai-visual-intent').value.trim()){aiStatus.textContent='仕上がりのイメージを入力してください。下の例を選ぶだけでも使えます。';document.querySelector('#ai-visual-intent').focus();return;}
 if(!document.querySelector('#ai-consent').checked){aiStatus.textContent='生成ボタンの上にある、選んだ写真と入力内容をOpenAIへ送る確認欄にチェックしてください。';return;}
 const headlineMode=document.querySelector('#ai-headline-mode').value;
 if(!document.querySelector('#ai-title').value.trim()||(headlineMode==='manual'&&(!headline.value.trim()||[...headline.value].length>80))){aiStatus.textContent='動画タイトルを入力してください。手入力を選んだ場合は、80文字以内の見出しも必要です。';return;}
 const selectedProject=document.querySelector('#project-name')?.value??'';
 control.disabled=true;document.querySelector('#clear-draft').disabled=true;if(typeof multiPhotos!=='undefined')multiPhotos.setLocked(true);
 let payload;try{payload=await captureAIInput();}catch(error){aiStatus.textContent=error.message;control.disabled=false;document.querySelector('#clear-draft').disabled=false;if(typeof multiPhotos!=='undefined')multiPhotos.setLocked(false);return;}
 updateCompletedResultStatus('previous');let validationHeaders;
 try{validationHeaders=await validationA.headers(payload);}catch(error){aiStatus.textContent=error.message;control.disabled=false;document.querySelector('#clear-draft').disabled=false;if(typeof multiPhotos!=='undefined')multiPhotos.setLocked(false);return;}
 if(payload.imageDataUrl.length>3*1024*1024){aiStatus.textContent='写真が大きすぎます。より小さな写真を選んでください。';control.disabled=false;document.querySelector('#clear-draft').disabled=false;if(typeof multiPhotos!=='undefined')multiPhotos.setLocked(false);return;}
 const sentPhoto=document.createElement('img'),sentLabel=document.createElement('p');sentPhoto.src=payload.imageDataUrl;sentPhoto.alt='今回APIへ送信する入力写真';sentLabel.textContent='今回APIへ送信する写真です。完成画像でもこの人物・素材が保持されているか確認してください。';document.querySelector('#ai-source').replaceChildren(sentLabel,sentPhoto);for(const [i,url]of (payload.additionalImageDataUrls??[]).entries()){const extraPhoto=document.createElement('img');extraPhoto.src=url;extraPhoto.alt='今回APIへ送信する追加写真'+(i+1);document.querySelector('#ai-source').append(extraPhoto);}
 control.disabled=true;document.querySelector('#clear-draft').disabled=true;if(typeof multiPhotos!=='undefined')multiPhotos.setLocked(true);
 // Preserve the previous real PNG before another paid request. Its old input is unknown.
 try{if(!validationA.record()&&typeof feedbackMemory!=='undefined'&&feedbackMemory){const feedback=await feedbackMemory.prepare({title:payload.title,projectName:selectedProject});if(feedback)payload.feedback=feedback;}if(completedResult)await completeGallery.rememberLegacy(completedResult);if(typeof completeGallery.preflight==='function')await completeGallery.preflight(payload,selectedProject);}
 catch(error){aiStatus.textContent=`生成前の比較保存を確認できません：${error.message} PNGを保存してから再度お試しください。`;control.disabled=false;document.querySelector('#clear-draft').disabled=false;if(typeof multiPhotos!=='undefined')multiPhotos.setLocked(false);return;}
 aiStatus.textContent='写真から完成画像を生成しています。自動再試行はしません。';
 let attemptId;try{if(typeof attemptHistory!=='undefined')attemptId=await attemptHistory.start({title:payload.title,projectName:selectedProject||payload.title,parentImageId:payload.revision?.parentImageId});}catch(error){aiStatus.textContent='生成試行の履歴を保存できません：'+error.message;control.disabled=false;document.querySelector('#clear-draft').disabled=false;if(typeof multiPhotos!=='undefined')multiPhotos.setLocked(false);return;}
 const started=performance.now();let imageElapsedMs=null,generationVersion=null,imageSha256=null,receivedValidationA;
 const logAttempt=async(status,error=null)=>{if(!attemptId)return;try{await attemptHistory.finish(attemptId,{status,error,elapsedMs:Math.round(performance.now()-started),imageElapsedMs,generationVersion,imageSha256,...(receivedValidationA!==undefined?{validationA:receivedValidationA}:{})});}catch{aiStatus.textContent+=' 生成試行の履歴を更新できませんでした。';}};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),190000);
 updateCompletedResultStatus('working');
 try{const response=await fetch('/api/v1/complete-thumbnail',{method:'POST',headers:{'Content-Type':'application/json',...validationHeaders},body:JSON.stringify(payload),signal:controller.signal});const data=await response.json();if(!response.ok){const failure=new Error(data.error?.message??'生成に失敗しました。');failure.apiError=true;throw failure;}
  imageElapsedMs=Math.round(performance.now()-started);generationVersion=data.generation_version??null;receivedValidationA=data.validationA;imageSha256=await hashBytes(fromDataUrl(data.imageDataUrl));
  showCompleted(data);scheduleDraft();
  try{await completeGallery.remember(payload,data,{elapsedMs:imageElapsedMs,...(validationHeaders['X-Validation-A-Case']?{expectedValidationACase:validationHeaders['X-Validation-A-Case']} :{}),...(attemptId?{id:attemptId}:{}),projectName:selectedProject});aiStatus.textContent='完成画像を比較一覧に保存しました。小さい表示で文字・主役・構図を見比べてください。';await logAttempt('success');}
  catch(error){updateCompletedResultStatus('save_error');aiStatus.textContent=`完成画像は生成できましたが、比較保存に失敗しました：${error.message} 表示中の完成PNGをファイルに保存してください。`;await logAttempt('save_error',error.message);}
 }catch(error){updateCompletedResultStatus('failed');aiStatus.textContent=error.name==='AbortError'?'待機期限を超えました。課金済みの可能性があります。利用履歴を確認してください。':`${error.message} 前回の完成画像は保持しています。`;await logAttempt(error.name==='AbortError'?'timeout':error.apiError?'api_error':'network_error',error.message);}
 finally{clearTimeout(timer);document.querySelector('#ai-consent').checked=false;document.querySelector('#clear-draft').disabled=false;if(typeof multiPhotos!=='undefined')multiPhotos.setLocked(false);control.disabled=false;const message=aiStatus.textContent;await checkAIStatus();aiStatus.textContent=message;}
});

// Draft lifecycle: restoring never sends images or resumes a paid request.
for(const selector of ['#ai-composition','#ai-design','#ai-reference-mode'])document.querySelector(selector).addEventListener('change',scheduleDraft);
document.querySelector('#ai-headline-mode').addEventListener('change',()=>{updateHeadlineControls();scheduleDraft();});
for(const selector of ['#ai-title','#ai-brief','#ai-visual-intent','#project-name','#revision-instruction'])document.querySelector(selector).addEventListener('input',()=>{scheduleDraft();if(['#ai-title','#project-name'].includes(selector))feedbackMemory.refresh();});
async function restoreDraft(){
 try{const saved=await loadDraft();if(saved){const draft=validateDraft(saved);feedbackMemory.restore(draft.feedbackSettings);validationA.restore(draft.validationA);activeRevision=draft.revision;document.querySelector('#project-name').value=draft.projectName;renderRevision();layout.value=draft.layout;headline.value=draft.headline;accent.value=draft.accent;document.querySelector('#ai-reference-mode').value=draft.validationA?draft.referenceMode:'required';document.querySelector('#ai-composition').value=draft.composition;document.querySelector('#ai-design').value=draft.design;document.querySelector('#ai-visual-intent').value=draft.visualIntent;document.querySelector('#ai-headline-mode').value=draft.headlineMode;document.querySelector('#ai-title').value=draft.title;document.querySelector('#ai-brief').value=draft.brief;document.querySelector('#text-position').value=draft.position;document.querySelector('#protect-subject').value=draft.protect;document.querySelector('#shade').value=draft.shade;
  for(let i=0;i<2;i++){Object.assign(settings[i],draft.settings[i]);const ranges=cards[i].querySelectorAll('input[type="range"]');['zoom','x','y'].forEach((key,n)=>ranges[n].value=settings[i][key]*100);if(draft.files[i]){const url=URL.createObjectURL(draft.files[i]);try{const image=new Image();image.src=url;await image.decode();photos[i]=image;storedFiles[i]=draft.files[i];}finally{URL.revokeObjectURL(url);}}}
  await multiPhotos.restore(draft.additionalPhotos);if(draft.result)showCompleted(draft.result,'restored');draw();document.querySelector('#draft-status').textContent='写真・入力内容・完成画像の下書きを復元しました。API送信の確認は毎回チェックしてください。';
 }else document.querySelector('#draft-status').textContent='変更した内容は、このブラウザに自動保存します。';}
 catch{document.querySelector('#draft-status').textContent='下書きを読み込めませんでした。ブラウザの保存設定を確認してください。通常編集は使えます。';}
 finally{restoring=false;feedbackMemory.refresh();updateHeadlineControls();designGuide.render();document.querySelector('#manual-editor-options').open=layout.value!=='single';document.querySelector('#ai-content-notes').open=!!document.querySelector('#ai-brief').value.trim();document.querySelector('#editor-workspace').disabled=false;document.querySelector('#ai-consent').checked=false;}
}
document.querySelector('#clear-draft').addEventListener('click',async()=>{
 if(!window.confirm('このブラウザの写真下書き・入力内容・完成画像・比較履歴を消しますか？ 必要なPNGは先にファイルへ保存してください。'))return;
 restoring=true;clearTimeout(saveTimer);document.querySelector('#editor-workspace').disabled=true;
 try{await saveQueue.catch(()=>{});await completeGallery.clear();await deleteDraft();for(let i=0;i<2;i++){storedFiles[i]=null;photos[i]=null;versions[i]++;cards[i].querySelector('input[type="file"]').value='';}completedResult=null;activeRevision=null;multiPhotos.clear();validationA.restore(null);feedbackMemory.restore(undefined);document.querySelector('#project-name').value='';renderRevision();document.querySelector('#ai-reference-mode').value='required';document.querySelector('#ai-composition').value='auto';document.querySelector('#ai-design').value='auto';document.querySelector('#ai-visual-intent').value='';document.querySelector('#ai-headline-mode').value='auto';document.querySelector('#ai-result').replaceChildren();document.querySelector('#ai-source').replaceChildren();document.querySelector('#auto-candidates').replaceChildren();headline.value='';document.querySelector('#ai-title').value='';document.querySelector('#ai-brief').value='';document.querySelector('#ai-consent').checked=false;draw();document.querySelector('#draft-status').textContent='このブラウザの下書きと完成画像の比較履歴を消しました。';}
 catch{document.querySelector('#draft-status').textContent='下書きを消せませんでした。ブラウザの保存設定を確認してください。';}
 finally{restoring=false;updateHeadlineControls();designGuide.render();document.querySelector('#ai-advanced-headline').open=false;document.querySelector('#ai-content-notes').open=false;document.querySelector('#editor-workspace').disabled=false;}
});

function downloadLocal(name,body,type,{autoStart=true}={}){const blob=new Blob([body],{type}),a=document.createElement('a');let url,timer;const prepare=()=>{if(!url){url=URL.createObjectURL(blob);a.href=url;}clearTimeout(timer);timer=setTimeout(()=>{URL.revokeObjectURL(url);url=null;},60000);};a.download=name;a.textContent='ファイルを保存';a.addEventListener('click',prepare);prepare();if(autoStart)a.click();return a;}
function renderRevision(){document.querySelector('#revision-tools').hidden=!activeRevision;document.querySelector('#revision-instruction').value=activeRevision?.instruction??'';const root=document.querySelector('#revision-preview');root.replaceChildren();if(activeRevision){const image=document.createElement('img');image.src=activeRevision.imageDataUrl;image.alt='修正の参考にする前の完成画像';image.style.width='min(100%,360px)';root.append(image);}}
async function applyImportedDraft(value){
 const draft=validateDraft(value),decoded=[];
 for(const file of draft.files){if(!file){decoded.push(null);continue;}const url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('写真が4000万画素を超えています。');decoded.push(image);}finally{URL.revokeObjectURL(url);}}
 for(const x of draft.additionalPhotos??[]){const image=new Image();image.src=x.imageDataUrl;await image.decode();if(image.naturalWidth!==1280||image.naturalHeight!==720)throw new Error('追加写真の寸法が不正です。');}
 for(const value of [draft.result?.imageDataUrl,draft.revision?.imageDataUrl].filter(Boolean)){const check=new Image();check.src=value;await check.decode();if(check.naturalWidth!==1536||check.naturalHeight!==864)throw new Error('完成PNGの寸法が不正です。');}
 clearTimeout(saveTimer);await saveQueue.catch(()=>{});await saveDraft(draft);restoring=true;
 try{feedbackMemory.restore(draft.feedbackSettings);validationA.restore(draft.validationA);layout.value=draft.layout;headline.value=draft.headline;accent.value=draft.accent;activeRevision=draft.revision;document.querySelector('#project-name').value=draft.projectName;
 for(const [id,key]of [['#ai-reference-mode','referenceMode'],['#ai-title','title'],['#ai-brief','brief'],['#ai-visual-intent','visualIntent'],['#ai-headline-mode','headlineMode'],['#ai-design','design'],['#ai-composition','composition'],['#text-position','position'],['#protect-subject','protect'],['#shade','shade']])document.querySelector(id).value=draft[key]??'';
 for(let i=0;i<2;i++){photos[i]=decoded[i];storedFiles[i]=draft.files[i];versions[i]++;Object.assign(settings[i],draft.settings[i]);cards[i].querySelector('input[type="file"]').value='';const ranges=cards[i].querySelectorAll('input[type="range"]');['zoom','x','y'].forEach((key,n)=>ranges[n].value=settings[i][key]*100);}
 if(!draft.validationA)document.querySelector('#ai-reference-mode').value='required';completedResult=null;document.querySelector('#ai-result').replaceChildren();document.querySelector('#ai-source').replaceChildren();document.querySelector('#auto-candidates').replaceChildren();await multiPhotos.restore(draft.additionalPhotos);if(draft.result)showCompleted(draft.result,'restored');renderRevision();feedbackMemory.refresh();updateHeadlineControls();designGuide.render();draw();document.querySelector('#ai-consent').checked=false;document.querySelector('#draft-status').textContent='下書きを読み込みました。';
 }finally{restoring=false;}
}
async function prepareRevision({group,image,instruction}){
 if(document.querySelector('#clear-draft').disabled)throw new Error('生成中は修正元を切り替えられません。');
 const next=captureCurrentDraft();next.additionalPhotos=(group.additionalImageDataUrls??[]).map((imageDataUrl,i)=>({file:new File([fromDataUrl(imageDataUrl)],`source-${i+2}.png`,{type:'image/png'}),imageDataUrl}));next.layout='single';next.settings[0]={zoom:1,x:.5,y:.5};next.files[0]=new Blob([fromDataUrl(group.sourceImageDataUrl)],{type:'image/png'});next.title=group.input.title;next.brief=group.input.brief;next.headline=group.input.headline??'';next.headlineMode=group.input.headlineMode??'manual';next.visualIntent=group.input.visualIntent;next.design=image.design??'auto';next.composition=image.composition??'auto';next.projectName=group.projectName??'';next.revision={instruction,parentImageId:image.id,imageDataUrl:image.result.imageDataUrl,sourceImageDataUrl:group.sourceImageDataUrl};
 document.querySelector('#editor-workspace').disabled=true;try{if(completedResult)await completeGallery.rememberLegacy(completedResult);await applyImportedDraft(next);document.querySelector('#revision-tools').scrollIntoView({block:'center'});}finally{document.querySelector('#editor-workspace').disabled=false;}
}
document.querySelector('#cancel-revision').addEventListener('click',()=>{activeRevision=null;renderRevision();scheduleDraft();});
const attemptHistory=createAttemptHistory({root:document.querySelector('#attempt-history'),download:downloadLocal});
const exportAttempts=document.createElement('button');exportAttempts.type='button';exportAttempts.textContent='生成エラー確認用の履歴を保存（無料）';
document.querySelector('#ai-complete').after(exportAttempts);
exportAttempts.addEventListener('click',async()=>{
 if(exportAttempts.disabled)return;exportAttempts.disabled=true;
 try{const link=await attemptHistory.exportJson();aiStatus.replaceChildren('試行履歴 complete-generation-attempts.json を出力しました。保存が始まらない場合：',...(link?[link]:[]));}
 catch(error){aiStatus.textContent='試行履歴を保存できません：'+error.message;}
 finally{exportAttempts.disabled=false;}
});
createEditorTools({root:document.querySelector('#editor-tools'),download:downloadLocal,captureDraft:async()=>{await saveQueue.catch(()=>{});return captureCurrentDraft();},restoreDraft:applyImportedDraft,isBusy:()=>document.querySelector('#clear-draft').disabled,setLocked:locked=>document.querySelector('#editor-workspace').disabled=locked,onPhoto:async file=>{const version=++versions[0],url=URL.createObjectURL(file);try{const image=new Image();image.src=url;await image.decode();if(version!==versions[0])return false;if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('写真が大きすぎます。');storedFiles[0]=file;photos[0]=image;settings[0]={zoom:1,x:.5,y:.5};layout.value='single';activeRevision=null;renderRevision();const ranges=cards[0].querySelectorAll('input[type="range"]');['zoom','x','y'].forEach((key,n)=>ranges[n].value=settings[0][key]*100);draw();await autoLayouts();}finally{URL.revokeObjectURL(url);}}});

restoreDraft();





