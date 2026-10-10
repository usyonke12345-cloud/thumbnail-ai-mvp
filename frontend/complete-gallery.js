import {COMPOSITIONS,DESIGNS,chooseDesign,MAX_IMAGES,createEntry,createLegacyEntry,comparisonBundle,validateQualityReview,parseCostUsd,gallerySummary,comparisonReport} from './complete-gallery-model.js';
import {galleryStorage} from './complete-gallery-store.js';
import {diagnoseComplete,diagnosticText} from './complete-png-transfer.js';
export function createCompleteGallery({root,document=globalThis.document,storage=galleryStorage,download=downloadFile,confirm=message=>window.confirm(message),diagnose=diagnoseComplete}={}){
 let state={groups:[],images:[],reviews:[]},selected='',width=360;
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;};
 const heading=el('h2','AI完成画像を見比べる'),intro=el('p','実際に生成した完成PNGを、同じ入力写真・タイトル・内容・見出しの作り方ごとに保存します。構図やデザインを変えて1枚ずつ作った結果を見比べられます。生成・自動学習はこの比較操作では行いません。'),feedback=el('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const select=el('select'),label=el('label','比較する組 ');label.append(select);select.setAttribute('aria-label','AI完成画像の比較する組');
 const refresh=el('button','保存一覧を更新');refresh.type='button';
 const toolbar=el('div');toolbar.className='preview-controls';const widthButtons=[];
 for(const size of [168,246,360]){const button=el('button',`${size}px`);button.type='button';button.addEventListener('click',()=>{width=size;for(const [n,b]of widthButtons)b.setAttribute('aria-pressed',String(n===width));renderImages();});toolbar.append(button);widthButtons.push([size,button]);button.setAttribute('aria-pressed',String(size===width));}
 const info=el('p'),source=el('div'),images=el('div');images.className='complete-gallery-images';
 const summary=el('pre');summary.className='complete-gallery-summary';
 const exportAll=el('button','全組の画像・記録・集計JSONを保存');exportAll.type='button';
 const form=el('form');form.className='complete-quality-form';form.noValidate=true;form.setAttribute('aria-label','AI完成画像の品質確認');
 const reviewer=el('input'),reviewerLabel=el('label','評価者の匿名ID（例：r01）');reviewer.type='text';reviewer.value='r01';reviewer.maxLength=40;reviewer.setAttribute('aria-label','AI完成画像の評価者ID');reviewerLabel.append(reviewer);
 const titleSource=el('select'),sourceLabel=el('label','タイトルの出典');titleSource.setAttribute('aria-label','AI完成画像のタイトル出典');for(const [value,text]of [['unknown','未確認'],['original','自分の動画用に作ったタイトル'],['external','他の作品・動画のタイトル'],['synthetic','練習用の人工タイトル']]){const option=el('option',text);option.value=value;titleSource.append(option);}titleSource.value='unknown';sourceLabel.append(titleSource);
 const titlePermission=el('input'),photoPermission=el('input'),titlePermissionLabel=el('label','タイトルを比較・分析に使えることを確認した'),photoPermissionLabel=el('label','入力写真を比較・分析に使えることを確認した');titlePermission.type=photoPermission.type='checkbox';titlePermissionLabel.prepend(titlePermission);photoPermissionLabel.prepend(photoPermission);titlePermission.setAttribute('aria-label','タイトルの利用確認');photoPermission.setAttribute('aria-label','写真の利用確認');
 const decision=el('select'),decisionLabel=el('label','使いたい案 ');decisionLabel.append(decision);decision.setAttribute('aria-label','AI完成画像の使いたい案');
 const reason=el('textarea'),reasonLabel=el('label','選んだ理由・直したい点（任意）');reason.maxLength=1000;reason.rows=2;reasonLabel.append(reason);reason.setAttribute('aria-label','AI完成画像の理由');
 const issues=el('div');issues.className='complete-quality-issues';const issueInputs=[];
 for(const [value,name]of [['text','文字'],['subject','人物・素材の保持'],['composition','構図'],['other','その他']]){const input=el('input'),wrap=el('label',name);input.type='checkbox';input.value=value;wrap.prepend(input);issues.append(wrap);issueInputs.push(input);}
 const save=el('button','この組の選択と理由を保存');save.type='submit';
 const qualityFeedback=el('p');qualityFeedback.setAttribute('role','status');qualityFeedback.setAttribute('aria-live','polite');
 const note=el('p','点数はまだ付けていません。「全部使わない」も記録できます。選択は生成AIや採点モデルへ自動送信されません。');
 form.append(reviewerLabel,sourceLabel,titlePermissionLabel,photoPermissionLabel,decisionLabel,reasonLabel,el('p','気になる点（任意）'),issues,save,qualityFeedback,note);
 const actions=el('div');actions.className='save-actions';const exportButton=el('button','写真・完成画像・比較記録のJSONを保存'),remove=el('button','この組を比較一覧から削除');exportButton.type=remove.type='button';actions.append(exportButton,remove);
 root.replaceChildren(heading,intro,feedback,summary,exportAll,label,refresh,toolbar,info,source,images,form,actions);
 function current(){return state.groups.find(x=>x.id===selected);}
 function outputs(){return state.images.filter(x=>x.groupId===selected);}
 function renderImages(){
  images.replaceChildren();outputs().forEach((image,i)=>{
   const name=`案${String.fromCharCode(65+i)}`,card=el('article'),title=el('h3',`${name}：${COMPOSITIONS[image.composition]??'以前の完成画像'}`),preview=el('img'),details=el('p'),link=el('a','この完成PNGを保存');
   preview.src=image.result.imageDataUrl;preview.alt=`AI完成画像の${name}`;preview.style.width=`min(100%,${width}px)`;preview.style.height='auto';preview.dataset.imageId=image.id;link.href=image.result.imageDataUrl;link.download=`ai-complete-${image.id}.png`;
   details.textContent=`${image.result.generation_version??'生成版不明'}・${image.elapsedMs===null?'生成時間不明':`${(image.elapsedMs/1000).toFixed(1)}秒`}・${image.design?`希望：${DESIGNS[image.design]}・`:''}未採点`;
   const record=el('form'),cost=el('input'),costLabel=el('label','この画像の実費（USD・任意）'),pngSave=el('select'),saveLabel=el('label','PNG保存を確認した結果'),button=el('button','実費と保存結果を記録'),status=el('p');
   record.className='complete-observation-form';record.noValidate=true;record.setAttribute('aria-label',`${name}の実費と保存結果`);cost.type='text';cost.inputMode='decimal';cost.maxLength=20;cost.placeholder='未確認は空欄';cost.value=image.observation?.costUsd===null||image.observation?.costUsd===undefined?'':String(image.observation.costUsd);cost.setAttribute('aria-label',`${name}の実費USD`);costLabel.append(cost);
   for(const [value,text]of [['unknown','未確認'],['saved','ファイル保存を確認できた'],['failed','ファイル保存できなかった']]){const option=el('option',text);option.value=value;pngSave.append(option);}pngSave.value=image.observation?.pngSave??'unknown';pngSave.setAttribute('aria-label',`${name}のPNG保存結果`);saveLabel.append(pngSave);button.type='submit';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   record.append(costLabel,saveLabel,button,status,el('p','実費は請求・利用履歴でこの生成分を確認した場合だけ入力してください。保存ボタンを押しただけでは成功と記録しません。'));
   record.addEventListener('submit',async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;try{const observation={version:1,recordedAt:new Date().toISOString(),costUsd:parseCostUsd(cost.value),pngSave:pngSave.value};state=await storage.observe(image.id,observation);renderSummary();status.textContent='実費と保存結果をブラウザ内に保存しました。追加料金はありません。';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
   const inspect=el('button','このPNGを無料で診断'),diagnosticStatus=el('p');inspect.type='button';diagnosticStatus.setAttribute('role','status');diagnosticStatus.setAttribute('aria-live','polite');
   inspect.addEventListener('click',async()=>{if(inspect.disabled)return;inspect.disabled=true;diagnosticStatus.textContent='このPC内でPNGを診断しています…';try{diagnosticStatus.textContent=diagnosticText(await diagnose(comparisonBundle(state,image.groupId),image.id),image.id);}catch(error){diagnosticStatus.textContent=`PNG診断に失敗しました：${error.message} 完成画像と比較記録は保持しています。`;}finally{inspect.disabled=false;}});
   card.append(title,preview,details,link,el('p','診断はこのPC内で行います。外部AIへは送らず、課金もありません。'),inspect,diagnosticStatus,record);images.append(card);
  });
 }
 function renderSummary(){
  const report=gallerySummary(state),seconds=value=>value===null?'不明':`${(value/1000).toFixed(1)}秒`;
  summary.textContent=`保存中：${report.images}枚 / ${report.groups}組\n選択記録：2枚以上の比較 ${report.comparedGroups}組 / 1枚の確認 ${report.singleImageReviews}組 / 案追加後の再確認待ち ${report.staleReviews}組\n20件の収集：保存中の人の比較 ${report.collection.humanComparisons}組 / 出典・利用確認済み実タイトルの比較 ${report.collection.authorizedRealComparisons}組\n生成時間：中央値 ${seconds(report.generationTime.medianMs)} / p95 ${seconds(report.generationTime.p95Ms)}（時間不明 ${report.generationTime.unknown}枚）\n確認済み実費：${report.cost.confirmedTotalUsd===null?'未確認':`${report.cost.confirmedTotalUsd} USD`}（実費不明 ${report.cost.unknownImages}枚）\nPNG保存：確認できた ${report.pngSave.saved}枚 / できなかった ${report.pngSave.failed}枚 / 未確認 ${report.pngSave.unknown}枚\n現在残っている成功画像だけの集計です。削除・失敗分は含みません。`;
  exportAll.disabled=!state.images.length;
 }
 function render(){
  qualityFeedback.textContent='';
  renderSummary();
  select.replaceChildren();const groups=[...state.groups].reverse();if(!groups.some(x=>x.id===selected))selected=groups[0]?.id??'';
  groups.forEach((g,i)=>{const option=el('option',g.input?`${i+1}：${g.input.title}`:'以前の完成画像（入力条件不明）');option.value=g.id;select.append(option);});select.value=selected;
  const group=current(),has=!!group;for(const node of [select,form,toolbar,actions,info,source])node.hidden=!has;
  renderImages();source.replaceChildren();decision.replaceChildren(el('option','選んでください'));decision.children[0].value='';
  outputs().forEach((x,i)=>{const option=el('option',`案${String.fromCharCode(65+i)}`);option.value=x.id;decision.append(option);});const none=el('option','全部使わない');none.value='none';decision.append(none);
  const review=state.reviews.find(x=>x.groupId===selected);reviewer.value=review?.context?.reviewerId??'r01';titleSource.value=review?.context?.titleSource??'unknown';titlePermission.checked=review?.context?.titlePermissionConfirmed??false;photoPermission.checked=review?.context?.photoPermissionConfirmed??false;decision.value=review?(review.decision==='none_acceptable'?'none':review.imageId):'';reason.value=review?.reason??'';for(const input of issueInputs)input.checked=review?.issues.includes(input.value)??false;
  if(!group){feedback.textContent='生成済みの完成画像はまだありません。写真を使ってAI生成すると、ここへ追加します。';return;}
  if(group.input){const photo=el('img'),caption=el('p','この組でAPIへ送った写真');photo.src=group.sourceImageDataUrl;photo.alt='この比較組の入力写真';photo.style.width='min(100%,246px)';source.append(caption,photo);info.textContent=`${outputs().length}案。見出し：${group.input.headlineMode==='auto'?'AIに任せる（実際の文言は画像で確認）':group.input.headline}　構図・デザインを変えて手動生成した結果を比較します。自動見出しの組では、案ごとに文言も変わる可能性があります。写真・内容・見出しの作り方が変わると別の組になります。`;}
  else info.textContent='復元した以前の完成画像です。生成時の入力写真・見出し・構図は記録されていないため、現在の入力と同じ組にはしません。';
  const currentReview=review&&comparisonBundle(state,selected).reviewCoversAllImages;
  feedback.textContent=`完成画像 ${state.images.length}/${MAX_IMAGES}枚をこのブラウザ内に保存しています。${currentReview?'この組の選択と理由は保存済みです。':review?'案が増えたため、以前の選択です。新しい案も比べて保存し直してください。':''}`;
 }
 async function reload(){state=await storage.load();render();}
 refresh.addEventListener('click',()=>reload().catch(error=>feedback.textContent=`一覧を読み込めません：${error.message}`));
 select.addEventListener('change',()=>{selected=select.value;render();});
  form.addEventListener('submit',async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;try{const group=current();if(!group)throw new Error('比較する組がありません。');const review={version:1,groupId:group.id,recordedAt:new Date().toISOString(),decision:decision.value==='none'?'none_acceptable':'selected',imageId:decision.value==='none'?null:decision.value,reason:reason.value,issues:issueInputs.filter(x=>x.checked).map(x=>x.value),context:{version:1,reviewerId:reviewer.value.trim(),titleSource:titleSource.value,titlePermissionConfirmed:titlePermission.checked,photoPermissionConfirmed:photoPermission.checked},displayWidths:[...images.querySelectorAll('img')].map(x=>({imageId:x.dataset.imageId,width:x.getBoundingClientRect().width}))};validateQualityReview(review,group,state.images);state=await storage.review(review);render();qualityFeedback.textContent=feedback.textContent='この組の選択と理由をブラウザ内に保存しました。API送信・追加料金はありません。';}catch(error){qualityFeedback.textContent=feedback.textContent=error.message;}finally{save.disabled=false;}});
 exportButton.addEventListener('click',()=>{try{download(`${selected}.json`,JSON.stringify(comparisonBundle(state,selected),null,2),'application/json');feedback.textContent='写真・完成PNG・比較記録のJSONを出力しました。非公開で扱ってください。';}catch(error){feedback.textContent=error.message;}});
 exportAll.addEventListener('click',()=>{try{download('complete-comparison-report.json',JSON.stringify(comparisonReport(state),null,2),'application/json');feedback.textContent='全組の写真・完成PNG・記録・集計を出力しました。非公開で扱ってください。';}catch(error){feedback.textContent=error.message;}});
 remove.addEventListener('click',async()=>{if(!confirm('この組を比較一覧から削除しますか？ 必要なPNGとJSONは先に保存してください。編集下書きの最後の完成PNGは別に残ります。'))return;remove.disabled=true;try{state=await storage.remove(selected);selected='';render();}catch(error){feedback.textContent=error.message;}finally{remove.disabled=false;}});
 render();feedback.textContent='完成画像の比較一覧を読み込んでいます…';
 const ready=reload().catch(error=>{feedback.textContent=`比較保存を読み込めません：${error.message} 完成PNGはファイルにも保存してください。`;});
 return {ready,async nextDesign(payload){await ready;state=await storage.load();return chooseDesign(state,payload);},async remember(payload,data,options){await ready;const entry=await createEntry(payload,data,options);state=await storage.add(entry);selected=entry.group.id;render();return state.added;},async rememberLegacy(data){await ready;const entry=await createLegacyEntry(data);state=await storage.add(entry);if(state.groups.some(x=>x.id===entry.group.id))selected=entry.group.id;render();},async clear(){await ready;state=await storage.clear();selected='';render();}};
}
function downloadFile(name,body,type){const url=URL.createObjectURL(new Blob([body],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
