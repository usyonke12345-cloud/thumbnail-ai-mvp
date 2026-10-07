const form=document.querySelector('#form'), button=document.querySelector('#submit'), status=document.querySelector('#status'), results=document.querySelector('#results');
const mode=document.querySelector('#mode');
let currentMode='demo';
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
    data.candidates.forEach((c,i)=> {
      const card=document.createElement('article'),img=document.createElement('img'),heading=document.createElement('h2'),details=document.createElement('p'),link=document.createElement('a');
      img.src=c.imageDataUrl;img.alt=`候補${i+1}: ${data.input.title}`;
      const pending=c.assessment.version==='0.1.0'&&c.metadata.textLayout?.elements.some(e=>e.role==='title'&&e.textBackdrop.kind==='image');
      heading.textContent=`${i+1}. ${c.style} — ${pending?'採点の接続確認中':`レイアウト ${c.assessment.overall}/100`}`;
      details.textContent=pending?'画像上の文字のコントラストは未評価です。採点側の更新と合流して確認します。':c.assessment.reasons.join(' / ');
      if(c.metadata.textLayout?.elements.some(e=>e.resolvedFontFamily===null))details.textContent+=' / 一部の文字は同梱フォント非対応です。絵文字などの見た目は環境によって変わり、収まりは未評価です。';
      const pngButton=document.createElement('button');pngButton.type='button';pngButton.textContent='PNGを保存';pngButton.addEventListener('click',()=>saveRaster(c,pngButton));
      const jpegButton=document.createElement('button');jpegButton.type='button';jpegButton.textContent='JPEGを保存';jpegButton.addEventListener('click',()=>saveRaster(c,jpegButton,'jpeg'));
      link.href=c.imageDataUrl;link.download=`thumbnail-${c.style}.svg`;link.textContent='SVGを保存';const actions=document.createElement('div');actions.className='save-actions';actions.append(pngButton,jpegButton,link);card.append(img,heading,details,actions);results.append(card);
    });status.textContent=`3案を表示しました（${data.elapsedMs}ms）。画像内容は未評価です。`;
  } catch(error) {
    status.textContent=error.name==='AbortError'?'応答の待ち時間を超えました。自動再試行はしていません。AI生成では課金済みの可能性があるため、利用履歴を確認してから再度お試しください。':error instanceof TypeError?'サーバーに接続できません。接続と起動状態を確認してから、もう一度「3案を作る」を押してください。AI生成を開始していた場合は利用履歴も確認してください。':error.message;
    if(results.children.length)status.textContent+=' 前回の候補は表示したままです。';
  }finally{clearTimeout(timer);button.disabled=false;}
});
