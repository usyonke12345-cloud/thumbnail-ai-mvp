const form=document.querySelector('#form'), button=document.querySelector('#submit'), status=document.querySelector('#status'), results=document.querySelector('#results');
form.addEventListener('submit',async event=> {
  event.preventDefault();button.disabled=true;status.textContent='候補を作成しています…';results.replaceChildren();
  try {
    const response=await fetch('/api/v1/thumbnails',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.querySelector('#title').value,genre:document.querySelector('#genre').value})});
    const data=await response.json();if(!response.ok) throw new Error(data.error?.message ?? '処理に失敗しました。');
    data.candidates.forEach((c,i)=> {
      const card=document.createElement('article'),img=document.createElement('img'),heading=document.createElement('h2'),details=document.createElement('p'),link=document.createElement('a');
      img.src=c.imageDataUrl;img.alt=`候補${i+1}: ${data.input.title}`;
      heading.textContent=`${i+1}. ${c.style} — レイアウト ${c.assessment.overall}/100`;
      details.textContent=c.assessment.reasons.join(' / ');
      link.href=c.imageDataUrl;link.download=`thumbnail-${c.style}.svg`;link.textContent='SVGを保存';card.append(img,heading,details,link);results.append(card);
    });status.textContent=`3案を表示しました（${data.elapsedMs}ms）。画像内容は未評価です。`;
  } catch(error) {status.textContent=error.message;}finally{button.disabled=false;}
});
