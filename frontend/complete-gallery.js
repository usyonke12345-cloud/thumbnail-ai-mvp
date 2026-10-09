import {COMPOSITIONS,MAX_IMAGES,createEntry,createLegacyEntry,comparisonBundle,validateQualityReview} from './complete-gallery-model.js';
import {galleryStorage} from './complete-gallery-store.js';
export function createCompleteGallery({root,document=globalThis.document,storage=galleryStorage,download=downloadFile,confirm=message=>window.confirm(message)}={}){
 let state={groups:[],images:[],reviews:[]},selected='',width=360;
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;};
 const heading=el('h2','AI完成画像を見比べる'),intro=el('p','実際に生成した完成PNGを、同じ入力写真・タイトル・内容・見出しごとに保存します。構図を変えて1枚ずつ作った結果を見比べられます。生成・自動学習はこの比較操作では行いません。'),feedback=el('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const select=el('select'),label=el('label','比較する組 ');label.append(select);select.setAttribute('aria-label','AI完成画像の比較する組');
 const refresh=el('button','保存一覧を更新');refresh.type='button';
 const toolbar=el('div');toolbar.className='preview-controls';const widthButtons=[];
 for(const size of [168,246,360]){const button=el('button',`${size}px`);button.type='button';button.addEventListener('click',()=>{width=size;for(const [n,b]of widthButtons)b.setAttribute('aria-pressed',String(n===width));renderImages();});toolbar.append(button);widthButtons.push([size,button]);button.setAttribute('aria-pressed',String(size===width));}
 const info=el('p'),source=el('div'),images=el('div');images.className='complete-gallery-images';
 const form=el('form');form.className='complete-quality-form';form.noValidate=true;
 const decision=el('select'),decisionLabel=el('label','使いたい案 ');decisionLabel.append(decision);decision.setAttribute('aria-label','AI完成画像の使いたい案');
 const reason=el('textarea'),reasonLabel=el('label','選んだ理由・直したい点（任意）');reason.maxLength=1000;reason.rows=2;reasonLabel.append(reason);reason.setAttribute('aria-label','AI完成画像の理由');
 const issues=el('div');issues.className='complete-quality-issues';const issueInputs=[];
 for(const [value,name]of [['text','文字'],['subject','人物・素材の保持'],['composition','構図'],['other','その他']]){const input=el('input'),wrap=el('label',name);input.type='checkbox';input.value=value;wrap.prepend(input);issues.append(wrap);issueInputs.push(input);}
 const save=el('button','この組の選択と理由を保存');save.type='submit';
 const qualityFeedback=el('p');qualityFeedback.setAttribute('role','status');qualityFeedback.setAttribute('aria-live','polite');
 const note=el('p','点数はまだ付けていません。「全部使わない」も記録できます。選択は生成AIや採点モデルへ自動送信されません。');
 form.append(decisionLabel,reasonLabel,el('p','気になる点（任意）'),issues,save,qualityFeedback,note);
 const actions=el('div');actions.className='save-actions';const exportButton=el('button','写真・完成画像・比較記録のJSONを保存'),remove=el('button','この組を比較一覧から削除');exportButton.type=remove.type='button';actions.append(exportButton,remove);
 root.replaceChildren(heading,intro,feedback,label,refresh,toolbar,info,source,images,form,actions);
 function current(){return state.groups.find(x=>x.id===selected);}
 function outputs(){return state.images.filter(x=>x.groupId===selected);}
 function renderImages(){
  images.replaceChildren();outputs().forEach((image,i)=>{const card=el('article'),title=el('h3',`案${String.fromCharCode(65+i)}：${COMPOSITIONS[image.composition]??'以前の完成画像'}`),preview=el('img'),details=el('p'),link=el('a','この完成PNGを保存');preview.src=image.result.imageDataUrl;preview.alt=`AI完成画像の案${String.fromCharCode(65+i)}`;preview.style.width=`min(100%,${width}px)`;preview.style.height='auto';preview.dataset.imageId=image.id;link.href=image.result.imageDataUrl;link.download=`ai-complete-${image.id}.png`;details.textContent=`${image.result.generation_version??'生成版不明'}・${image.elapsedMs===null?'生成時間不明':`${(image.elapsedMs/1000).toFixed(1)}秒`}・未採点`;card.append(title,preview,details,link);images.append(card);});
 }
 function render(){
  qualityFeedback.textContent='';
  select.replaceChildren();const groups=[...state.groups].reverse();if(!groups.some(x=>x.id===selected))selected=groups[0]?.id??'';
  groups.forEach((g,i)=>{const option=el('option',g.input?`${i+1}：${g.input.title}`:'以前の完成画像（入力条件不明）');option.value=g.id;select.append(option);});select.value=selected;
  const group=current(),has=!!group;for(const node of [select,form,toolbar,actions,info,source])node.hidden=!has;
  renderImages();source.replaceChildren();decision.replaceChildren(el('option','選んでください'));decision.children[0].value='';
  outputs().forEach((x,i)=>{const option=el('option',`案${String.fromCharCode(65+i)}`);option.value=x.id;decision.append(option);});const none=el('option','全部使わない');none.value='none';decision.append(none);
  const review=state.reviews.find(x=>x.groupId===selected);decision.value=review?(review.decision==='none_acceptable'?'none':review.imageId):'';reason.value=review?.reason??'';for(const input of issueInputs)input.checked=review?.issues.includes(input.value)??false;
  if(!group){feedback.textContent='生成済みの完成画像はまだありません。写真を使ってAI生成すると、ここへ追加します。';return;}
  if(group.input){const photo=el('img'),caption=el('p','この組でAPIへ送った写真');photo.src=group.sourceImageDataUrl;photo.alt='この比較組の入力写真';photo.style.width='min(100%,246px)';source.append(caption,photo);info.textContent=`${outputs().length}案。見出し：${group.input.headline}　構図を変えて手動生成した結果だけを比較します。写真・内容・見出しが変わると別の組になります。`;}
  else info.textContent='復元した以前の完成画像です。生成時の入力写真・見出し・構図は記録されていないため、現在の入力と同じ組にはしません。';
  const currentReview=review&&comparisonBundle(state,selected).reviewCoversAllImages;
  feedback.textContent=`完成画像 ${state.images.length}/${MAX_IMAGES}枚をこのブラウザ内に保存しています。${currentReview?'この組の選択と理由は保存済みです。':review?'案が増えたため、以前の選択です。新しい案も比べて保存し直してください。':''}`;
 }
 async function reload(){state=await storage.load();render();}
 refresh.addEventListener('click',()=>reload().catch(error=>feedback.textContent=`一覧を読み込めません：${error.message}`));
 select.addEventListener('change',()=>{selected=select.value;render();});
 form.addEventListener('submit',async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;try{const group=current();if(!group)throw new Error('比較する組がありません。');const review={version:1,groupId:group.id,recordedAt:new Date().toISOString(),decision:decision.value==='none'?'none_acceptable':'selected',imageId:decision.value==='none'?null:decision.value,reason:reason.value,issues:issueInputs.filter(x=>x.checked).map(x=>x.value),displayWidths:[...images.querySelectorAll('img')].map(x=>({imageId:x.dataset.imageId,width:x.getBoundingClientRect().width}))};validateQualityReview(review,group,state.images);state=await storage.review(review);render();qualityFeedback.textContent=feedback.textContent='この組の選択と理由をブラウザ内に保存しました。API送信・追加料金はありません。';}catch(error){qualityFeedback.textContent=feedback.textContent=error.message;}finally{save.disabled=false;}});
 exportButton.addEventListener('click',()=>{try{download(`${selected}.json`,JSON.stringify(comparisonBundle(state,selected),null,2),'application/json');feedback.textContent='写真・完成PNG・比較記録のJSONを出力しました。非公開で扱ってください。';}catch(error){feedback.textContent=error.message;}});
 remove.addEventListener('click',async()=>{if(!confirm('この組を比較一覧から削除しますか？ 必要なPNGとJSONは先に保存してください。編集下書きの最後の完成PNGは別に残ります。'))return;remove.disabled=true;try{state=await storage.remove(selected);selected='';render();}catch(error){feedback.textContent=error.message;}finally{remove.disabled=false;}});
 render();feedback.textContent='完成画像の比較一覧を読み込んでいます…';
 const ready=reload().catch(error=>{feedback.textContent=`比較保存を読み込めません：${error.message} 完成PNGはファイルにも保存してください。`;});
 return {ready,async remember(payload,data,options){await ready;const entry=await createEntry(payload,data,options);state=await storage.add(entry);selected=entry.group.id;render();return state.added;},async rememberLegacy(data){await ready;const entry=await createLegacyEntry(data);state=await storage.add(entry);if(state.groups.some(x=>x.id===entry.group.id))selected=entry.group.id;render();},async clear(){await ready;state=await storage.clear();selected='';render();}};
}
function downloadFile(name,body,type){const url=URL.createObjectURL(new Blob([body],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
