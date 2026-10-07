const form=document.querySelector('#form'), button=document.querySelector('#submit'), status=document.querySelector('#status'), results=document.querySelector('#results');
const mode=document.querySelector('#mode');
async function savePng(candidate, control) {
  control.disabled=true;
  try {
    const image=new Image();image.src=candidate.imageDataUrl;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const context=canvas.getContext('2d');if(!context)throw new Error('画像保存に対応していないブラウザです。');
    context.drawImage(image,0,0,1280,720);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNGへ変換できませんでした。')),'image/png'));
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`thumbnail-${candidate.style}.png`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent='1280×720のPNGを保存しました。';
  }catch(error){status.textContent=`PNG保存に失敗しました: ${error.message}`;}finally{control.disabled=false;}
}
function showMode(value) {mode.textContent=value==='ai_background'?'AI背景生成モードです。背景1枚から文字と配色の3案を作ります。生成にはAPI利用料がかかります。画像内容とCTRは未評価です。':'現在は無料のSVGレイアウトデモです。AI画像生成は使用していません。スコアはCTR予測ではありません。';}
fetch('/api/v1/health').then(r=>{if(!r.ok)throw new Error();return r.json();}).then(data=>showMode(data.mode)).catch(()=>{mode.textContent='接続を確認できません。サーバーを起動してください。';});
form.addEventListener('submit',async event=> {
  event.preventDefault();button.disabled=true;status.textContent='候補を作成しています。AI背景生成には最大2〜3分かかることがあります…';results.replaceChildren();
  try {
    const response=await fetch('/api/v1/thumbnails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.querySelector('#title').value,genre:document.querySelector('#genre').value})});
    const data=await response.json();if(!response.ok) throw new Error(data.error?.message ?? '処理に失敗しました。');
    showMode(data.mode);
    data.candidates.forEach((c,i)=> {
      const card=document.createElement('article'),img=document.createElement('img'),heading=document.createElement('h2'),details=document.createElement('p'),link=document.createElement('a');
      img.src=c.imageDataUrl;img.alt=`候補${i+1}: ${data.input.title}`;
      heading.textContent=`${i+1}. ${c.style} — レイアウト ${c.assessment.overall}/100`;
      details.textContent=c.assessment.reasons.join(' / ');
      const pngButton=document.createElement('button');pngButton.type='button';pngButton.textContent='PNGを保存';pngButton.addEventListener('click',()=>savePng(c,pngButton));
      link.href=c.imageDataUrl;link.download=`thumbnail-${c.style}.svg`;link.textContent='SVGを保存';card.append(img,heading,details,pngButton,link);results.append(card);
    });status.textContent=`3案を表示しました（${data.elapsedMs}ms）。画像内容は未評価です。`;
  } catch(error) {status.textContent=error.message;}finally{button.disabled=false;}
});
