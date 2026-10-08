import {cropPlacement,fitHeadline,suggestPhotoLayouts} from './editor-layout.js';
import {loadDraft,saveDraft,deleteDraft,validateDraft} from './editor-draft.js';
const storedFiles=[null,null];let completedResult=null,restoring=true,saveTimer,saveQueue=Promise.resolve();
function scheduleDraft(){if(restoring)return;clearTimeout(saveTimer);document.querySelector('#draft-status').textContent='下書きを保存しています…';saveTimer=setTimeout(()=>{const draft={version:1,layout:layout.value,settings,files:storedFiles,headline:headline.value,title:document.querySelector('#ai-title').value,brief:document.querySelector('#ai-brief').value,accent:accent.value,position:document.querySelector('#text-position').value,protect:document.querySelector('#protect-subject').value,shade:document.querySelector('#shade').value,result:completedResult};saveQueue=saveQueue.catch(()=>{}).then(()=>saveDraft(draft)).then(()=>{document.querySelector('#draft-status').textContent='下書きをこのブラウザに保存しました。リロード後に復元できます。';}).catch(()=>{document.querySelector('#draft-status').textContent='下書きを保存できません。容量やブラウザ設定を確認し、完成PNGをファイルへ保存してください。';});},300);}
function showCompleted(data){completedResult=data;const image=document.createElement('img'),link=document.createElement('a'),note=document.createElement('p');image.src=data.imageDataUrl;image.alt='AIによる完成サムネ';link.href=data.imageDataUrl;link.download='ai-complete-thumbnail.png';link.textContent='完成PNGを保存（1536×864）';note.textContent=data.limitations.join(' ');document.querySelector('#ai-result').replaceChildren(image,note,link);}
const canvas=document.querySelector('#preview'),ctx=canvas.getContext('2d'),status=document.querySelector('#editor-status');
const photos=[null,null],versions=[0,0],settings=[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}],cards=[];
const layout=document.querySelector('#layout'),headline=document.querySelector('#headline'),accent=document.querySelector('#accent');
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
  try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('PNG・JPEG・WebPの20MB以内の写真を選んでください。');url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();if(version!==versions[index])return;if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('4000万画素以内の写真を選んでください。');storedFiles[index]=file;photos[index]=image;draw();if(index===0&&layout.value==='single')await autoLayouts();}
  catch(error){if(version===versions[index])status.textContent=`写真を読み込めません：${error.message} 前の写真は保持しています。`;}
  finally{if(url)URL.revokeObjectURL(url);}
 });
 for(const [key,name,min,max]of [['zoom','拡大',100,200],['x','横の切り取り位置',0,100],['y','縦の切り取り位置',0,100]]){
  const wrap=document.createElement('label'),range=document.createElement('input');wrap.textContent=name;range.type='range';range.min=min;range.max=max;range.value=settings[index][key]*100;range.addEventListener('input',()=>{suggestionRun++;settings[index][key]=Number(range.value)/100;draw();});wrap.append(range);card.append(wrap);
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
document.querySelector('#ai-complete').addEventListener('click',async event=>{
 const control=event.currentTarget;if(control.disabled)return;
 if(layout.value!=='single'||!photos[0]){aiStatus.textContent='「1枚の写真を全面に使う」を選び、「使う写真」から写真を読み込んでください。';return;}
 if(!document.querySelector('#ai-consent').checked){aiStatus.textContent='ボタンの上にある「写真・タイトル・動画内容・見出しをOpenAIへ送り…」の確認にチェックしてください。';return;}
 if(!document.querySelector('#ai-title').value.trim()||!document.querySelector('#ai-brief').value.trim()||!headline.value.trim()||[...headline.value].length>80){aiStatus.textContent='動画タイトル・内容と、80文字以内の見出しを入力してください。';return;}
 const source=document.createElement('canvas');source.width=1280;source.height=720;const c=source.getContext('2d'),p=cropPlacement(photos[0].naturalWidth,photos[0].naturalHeight,{x:0,y:0,width:1280,height:720},settings[0].zoom,settings[0].x,settings[0].y);c.drawImage(photos[0],p.x,p.y,p.width,p.height);
 const payload={title:document.querySelector('#ai-title').value,brief:document.querySelector('#ai-brief').value,headline:headline.value,imageDataUrl:source.toDataURL('image/png'),consent:true};
 if(payload.imageDataUrl.length>3*1024*1024){aiStatus.textContent='写真が大きすぎます。より小さな写真を選んでください。';return;}
 const sentPhoto=document.createElement('img'),sentLabel=document.createElement('p');sentPhoto.src=payload.imageDataUrl;sentPhoto.alt='今回APIへ送信する入力写真';sentLabel.textContent='今回APIへ送信する写真です。完成画像でもこの人物・素材が保持されているか確認してください。';document.querySelector('#ai-source').replaceChildren(sentLabel,sentPhoto);
 control.disabled=true;document.querySelector('#clear-draft').disabled=true;aiStatus.textContent='写真から完成画像を生成しています。自動再試行はしません。';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),190000);
 try{const response=await fetch('/api/v1/complete-thumbnail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'生成に失敗しました。');
  showCompleted(data);scheduleDraft();aiStatus.textContent='完成画像を表示しました。文字と主役を確認して保存してください。';
 }catch(error){aiStatus.textContent=error.name==='AbortError'?'待機期限を超えました。課金済みの可能性があります。利用履歴を確認してください。':`${error.message} 前回の完成画像は保持しています。`;}
 finally{clearTimeout(timer);document.querySelector('#clear-draft').disabled=false;control.disabled=false;const message=aiStatus.textContent;await checkAIStatus();aiStatus.textContent=message;}
});

// Draft lifecycle: restoring never sends images or resumes a paid request.
for(const selector of ['#ai-title','#ai-brief'])document.querySelector(selector).addEventListener('input',scheduleDraft);
async function restoreDraft(){
 try{const saved=await loadDraft();if(saved){const draft=validateDraft(saved);layout.value=draft.layout;headline.value=draft.headline;accent.value=draft.accent;document.querySelector('#ai-title').value=draft.title;document.querySelector('#ai-brief').value=draft.brief;document.querySelector('#text-position').value=draft.position;document.querySelector('#protect-subject').value=draft.protect;document.querySelector('#shade').value=draft.shade;
  for(let i=0;i<2;i++){Object.assign(settings[i],draft.settings[i]);const ranges=cards[i].querySelectorAll('input[type="range"]');['zoom','x','y'].forEach((key,n)=>ranges[n].value=settings[i][key]*100);if(draft.files[i]){const url=URL.createObjectURL(draft.files[i]);try{const image=new Image();image.src=url;await image.decode();photos[i]=image;storedFiles[i]=draft.files[i];}finally{URL.revokeObjectURL(url);}}}
  if(draft.result)showCompleted(draft.result);draw();document.querySelector('#draft-status').textContent='写真・入力内容・完成画像の下書きを復元しました。API送信の確認は毎回チェックしてください。';
 }else document.querySelector('#draft-status').textContent='変更した内容は、このブラウザに自動保存します。';}
 catch{document.querySelector('#draft-status').textContent='下書きを読み込めませんでした。ブラウザの保存設定を確認してください。通常編集は使えます。';}
 finally{restoring=false;document.querySelector('#editor-workspace').disabled=false;document.querySelector('#ai-consent').checked=false;}
}
document.querySelector('#clear-draft').addEventListener('click',async()=>{
 if(!window.confirm('このブラウザの保存済み写真・入力内容・完成画像を消しますか？ 必要なPNGは先にファイルへ保存してください。'))return;
 restoring=true;clearTimeout(saveTimer);document.querySelector('#editor-workspace').disabled=true;
 try{await saveQueue.catch(()=>{});await deleteDraft();for(let i=0;i<2;i++){storedFiles[i]=null;photos[i]=null;versions[i]++;cards[i].querySelector('input[type="file"]').value='';}completedResult=null;document.querySelector('#ai-result').replaceChildren();document.querySelector('#ai-source').replaceChildren();document.querySelector('#auto-candidates').replaceChildren();headline.value='';document.querySelector('#ai-title').value='';document.querySelector('#ai-brief').value='';document.querySelector('#ai-consent').checked=false;draw();document.querySelector('#draft-status').textContent='このブラウザの下書きを消しました。';}
 catch{document.querySelector('#draft-status').textContent='下書きを消せませんでした。ブラウザの保存設定を確認してください。';}
 finally{restoring=false;document.querySelector('#editor-workspace').disabled=false;}
});
restoreDraft();





