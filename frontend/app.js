const form=document.querySelector('#form'), button=document.querySelector('#submit'), status=document.querySelector('#status'), results=document.querySelector('#results');
const mode=document.querySelector('#mode');
let currentMode='demo';
const choiceKey='thumbnail-latest-preference-v1';
const previewControls=document.createElement('div'),previewNote=document.createElement('p');previewControls.className='preview-controls';previewNote.textContent='表示幅を変えて、文字・人物・構図を見比べます。幅は検証用の仮値です。画像の保存サイズは変わりません。';
for(const width of [null,168,246,360]){const control=document.createElement('button');control.type='button';control.textContent=width===null?'通常表示':`${width}px`;control.setAttribute('aria-pressed',String(width===null));control.addEventListener('click',()=>{results.style.setProperty('--preview-width',width===null?'100%':`${width}px`);for(const item of previewControls.children)item.setAttribute('aria-pressed',String(item===control));});previewControls.append(control);}
results.before(previewNote,previewControls);
const choiceStatus=document.createElement('p'),choiceExport=document.createElement('a');
choiceStatus.setAttribute('role','status');choiceExport.textContent='最新の選択記録をJSONで保存';choiceExport.hidden=true;results.before(choiceStatus,choiceExport);
const choiceClear=document.createElement('button');choiceClear.type='button';choiceClear.textContent='最新の選択記録を消す';choiceClear.hidden=true;results.before(choiceClear);
const choiceCards=new Map();
let currentComparison=null;
let frozenSet=null;
const freezeButton=document.createElement('button'),reviewLink=document.createElement('a');freezeButton.type='button';freezeButton.textContent='この3案を固定保存';freezeButton.disabled=true;reviewLink.href='/review';reviewLink.textContent='保存した3案の比較・20件の記録へ';results.before(freezeButton,reviewLink);
freezeButton.addEventListener('click',async()=>{if(!currentComparison||freezeButton.disabled)return;freezeButton.disabled=true;const response=currentComparison;try{const [{freezeComparison},{saveSet}]=await Promise.all([import('/comparison-model.js'),import('/comparison-store.js')]);const set=frozenSet??freezeComparison(response,crypto.randomUUID());await saveSet(set);if(currentComparison===response)frozenSet=set;choiceStatus.textContent=`3案を固定保存しました。組ID ${set.id}。比較画面で同じ画像を再表示できます。`;}catch(error){choiceStatus.textContent=`固定保存できませんでした：${error.message}`;}finally{freezeButton.disabled=!currentComparison;}});
const rejectControls=document.createElement('div'),rejectReason=document.createElement('textarea'),rejectButton=document.createElement('button');rejectControls.hidden=true;rejectReason.maxLength=500;rejectReason.placeholder='どの案も使わない理由（任意）';rejectReason.setAttribute('aria-label','どの案も使わない理由');rejectButton.type='button';rejectButton.textContent='どの案も使わないと記録';rejectControls.append(rejectReason,rejectButton);results.before(rejectControls);
function markChoice(id){for(const [key,{card,choose}] of choiceCards){card.classList.toggle('selected-candidate',key===id);choose.setAttribute('aria-pressed',String(key===id));choose.textContent=key===id?'選択した案（理由を更新できます）':'この案を選んで記録';}}
choiceClear.addEventListener('click',()=>{try{localStorage.removeItem(choiceKey);markChoice(null);choiceExport.hidden=true;choiceExport.removeAttribute('href');choiceClear.hidden=true;choiceStatus.textContent='最新の選択記録を消しました。保存済みのJSONファイルは残ります。';}catch{choiceStatus.textContent='選択記録を消せませんでした。ブラウザの保存設定を確認してください。';}});
function showChoice(record){markChoice(record.candidateId);choiceStatus.textContent=`最新の選択：${record.decision==='none_acceptable'?'どの案も使わない':record.style}（${record.title}） / ${record.reason||'理由未記入'}。このブラウザ内の記録です。`;choiceExport.href=`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(record,null,2))}`;choiceExport.download='thumbnail-preference.json';choiceExport.hidden=false;choiceClear.hidden=false;}
rejectButton.addEventListener('click',()=>{if(!currentComparison)return;const data=currentComparison;const record={version:1,decision:'none_acceptable',selectedAt:new Date().toISOString(),title:data.input.title,genre:data.input.genre,mode:data.mode,candidateId:null,style:'none',generationVersion:null,assessmentVersion:null,assessment:null,elapsedMs:data.elapsedMs,reason:rejectReason.value.trim(),candidateOrder:data.candidates.map(item=>item.id),candidates:data.candidates.map(item=>({id:item.id,style:item.style,generationVersion:item.metadata?.generation_version??null,assessment:item.assessment}))};try{localStorage.setItem(choiceKey,JSON.stringify(record));showChoice(record);}catch{choiceStatus.textContent='選択記録を保存できませんでした。ブラウザの保存容量・設定を確認してください。';}});
try{const record=JSON.parse(localStorage.getItem(choiceKey));if(record?.version===1&&typeof record.title==='string'&&typeof record.style==='string'&&typeof record.reason==='string')showChoice(record);}catch{choiceStatus.textContent='以前の選択記録を読み込めませんでした。新しい案を選び直せます。';}
async function saveRaster(candidate, control, format='png') {
  const jpeg=format==='jpeg',label=jpeg?'JPEG':'PNG',mime=jpeg?'image/jpeg':'image/png',extension=jpeg?'jpg':'png';
  control.disabled=true;
  try {
    // Open while the click still carries user activation (before decode/toBlob).
    const fileHandle=typeof window.showSaveFilePicker==='function'?await window.showSaveFilePicker({suggestedName:`thumbnail-${candidate.style}.${extension}`,types:[{description:label,accept:{[mime]:[`.${extension}`]}}]}):null;
    const image=new Image();image.src=candidate.imageDataUrl;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const context=canvas.getContext('2d');if(!context)throw new Error('画像保存に対応していないブラウザです。');
    context.drawImage(image,0,0,1280,720);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error(`${label}へ変換できませんでした。`)),mime,jpeg ? 0.92 : undefined));
    if(fileHandle){const writable=await fileHandle.createWritable();try{await writable.write(blob);await writable.close();}catch(error){await writable.abort().catch(()=>{});throw error;}status.textContent=`1280×720の${label}を選択した保存先へ保存しました。`;return;}
    const link=document.createElement('a');link.href=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('保存リンクを作れませんでした。'));reader.readAsDataURL(blob);});link.download=`thumbnail-${candidate.style}.${extension}`;link.textContent=`作成した${label}をダウンロード`;
    control.parentElement.querySelector(`[data-raster-download="${format}"]`)?.remove();link.dataset.rasterDownload=format;control.after(link);link.click();
    status.textContent=`1280×720の${label}を作成しました。保存が始まらない場合はダウンロードリンクを押してください。`;
  }catch(error){status.textContent=error.name==='AbortError'?'保存をキャンセルしました。':`${label}保存に失敗しました: ${error.message}`;}finally{control.disabled=false;}
}
function showMode(value) {currentMode=value;mode.textContent=value==='ai_background'?'AI背景生成モードです。背景1枚から文字と配色の3案を作ります。生成にはAPI利用料がかかります。画像内容とCTRは未評価です。':'現在は無料のSVGレイアウトデモです。AI画像生成は使用していません。スコアはCTR予測ではありません。';}
fetch('/api/v1/health').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>showMode(data.mode)).catch(()=>{mode.textContent='接続を確認できません。サーバーを起動してください。';});
form.addEventListener('submit',async event=> {
  event.preventDefault();if(button.disabled)return;button.disabled=true;
  status.textContent=currentMode==='ai_background'?'背景を生成しています。最大3分ほどお待ちください。':'候補を作成しています…';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),190000);
  try {
    const response=await fetch('/api/v1/thumbnails',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.querySelector('#title').value,genre:document.querySelector('#genre').value})});
    const data=await response.json();if(!response.ok) throw new Error(data.error?.message ?? '処理に失敗しました。');
    showMode(data.mode);
    results.replaceChildren();
    choiceCards.clear();
    currentComparison=data;frozenSet=null;freezeButton.disabled=false;rejectControls.hidden=false;rejectReason.value='';
    const metricLabels={contrast:'コントラスト',brevity:'短さ',font:'文字サイズ',fit:'収まり'};
    let previousGroup=null;
    data.candidates.forEach((c,i)=> {
      const missing=[...new Set(c.assessment.unevaluated??[])].sort(),group=missing.join('|');
      if(Array.isArray(c.assessment.unevaluated)&&group!==previousGroup){const groupHeading=document.createElement('h2'),explanation=document.createElement('p');groupHeading.textContent=missing.length?`未評価：${missing.map(k=>metricLabels[k]??k).join('・')}`:'すべてのレイアウト項目を評価';explanation.textContent='同じ評価項目の案をまとめています。グループ間の表示順は品質の順位ではありません。';results.append(groupHeading,explanation);previousGroup=group;}
      const card=document.createElement('article'),img=document.createElement('img'),heading=document.createElement('h2'),details=document.createElement('p'),link=document.createElement('a');
      img.src=c.imageDataUrl;img.alt=`候補${i+1}: ${data.input.title}`;
      const pending=c.assessment.version==='0.1.0'&&c.metadata?.textLayout?.elements.some(e=>e.role==='title'&&e.textBackdrop.kind==='image');
      const range=Number.isFinite(c.assessment.overallMax)&&c.assessment.overallMax!==c.assessment.overall?`${c.assessment.overall}〜${c.assessment.overallMax}点`:`${c.assessment.overall}/100`;
      heading.textContent=`${i+1}. ${c.style} — ${pending?'採点の接続確認中':`レイアウト ${range}`}`;
      details.textContent=pending?'画像上の文字のコントラストは未評価です。採点側の更新と合流して確認します。':c.assessment.reasons.join(' / ');
      if(Array.isArray(c.assessment.unevaluated)){details.textContent+=` / 内訳：${Object.entries(c.assessment.metrics).map(([key,value])=>`${metricLabels[key]??key} ${value===null?'未評価':`${value}点`}`).join('・')}`;if(missing.length)details.textContent+=' / 点数の幅は評価できた項目から計算した暫定の範囲です。信頼区間やCTR予測ではありません。';}
      if(c.assessment.weights)details.textContent+=` / 重み：${Object.entries(c.assessment.weights).map(([key,value])=>`${metricLabels[key]??key} ${value}%`).join('・')}`;
      if(c.assessment.limitations?.length)details.textContent+=` / 評価の限界：${c.assessment.limitations.join(' / ')}`;
      if(c.metadata?.textLayout?.elements.some(e=>e.resolvedFontFamily===null))details.textContent+=' / 一部の文字は同梱フォント非対応です。絵文字などの見た目は環境によって変わり、収まりは未評価です。';
      const pngButton=document.createElement('button');pngButton.type='button';pngButton.textContent='PNGを保存';pngButton.addEventListener('click',()=>saveRaster(c,pngButton));
      const jpegButton=document.createElement('button');jpegButton.type='button';jpegButton.textContent='JPEGを保存';jpegButton.addEventListener('click',()=>saveRaster(c,jpegButton,'jpeg'));
      const reason=document.createElement('input'),choose=document.createElement('button');reason.type='text';reason.maxLength=500;reason.placeholder='選ぶ理由（任意）';reason.setAttribute('aria-label',`${c.style}を選ぶ理由`);choose.type='button';choose.textContent='この案を選んで記録';
      choose.setAttribute('aria-pressed','false');choiceCards.set(c.id,{card,choose});
      choose.addEventListener('click',()=>{const record={version:1,decision:'selected',selectedAt:new Date().toISOString(),title:data.input.title,genre:data.input.genre,mode:data.mode,candidateId:c.id,style:c.style,generationVersion:c.metadata?.generation_version??null,assessmentVersion:c.assessment.version,assessment:c.assessment,elapsedMs:data.elapsedMs,reason:reason.value.trim(),actualDisplayWidth:img.getBoundingClientRect?.().width??null,candidateOrder:data.candidates.map(item=>item.id),candidates:data.candidates.map(item=>({id:item.id,style:item.style,generationVersion:item.metadata?.generation_version??null,assessment:item.assessment}))};try{localStorage.setItem(choiceKey,JSON.stringify(record));showChoice(record);}catch{choiceStatus.textContent='選択記録を保存できませんでした。ブラウザの保存容量・設定を確認してください。';}});

      link.href=c.imageDataUrl;link.download=`thumbnail-${c.style}.svg`;link.textContent='SVGを保存';const actions=document.createElement('div');actions.className='save-actions';actions.append(pngButton,jpegButton,link);card.append(img,heading,details,reason,choose,actions);results.append(card);
    });status.textContent=`3案を表示しました（${data.elapsedMs}ms）。画像内容は未評価です。`;
  } catch(error) {
    status.textContent=error.name==='AbortError'?'応答の待ち時間を超えました。自動再試行はしていません。AI生成では課金済みの可能性があるため、利用履歴を確認してから再度お試しください。':error instanceof TypeError?'サーバーに接続できません。接続と起動状態を確認してから、もう一度「3案を作る」を押してください。AI生成を開始していた場合は利用履歴も確認してください。':error.message;
    if(results.children.length)status.textContent+=' 前回の候補は表示したままです。';
  }finally{clearTimeout(timer);button.disabled=false;}
});
