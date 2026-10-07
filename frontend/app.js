const form=document.querySelector('#form'), button=document.querySelector('#submit'), status=document.querySelector('#status'), results=document.querySelector('#results');
const mode=document.querySelector('#mode');
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
      link.href=c.imageDataUrl;link.download=`thumbnail-${c.style}.svg`;link.textContent='SVGを保存';card.append(img,heading,details,link);results.append(card);
    });status.textContent=`3案を表示しました（${data.elapsedMs}ms）。画像内容は未評価です。`;
  } catch(error) {status.textContent=error.message;}finally{button.disabled=false;}
});
