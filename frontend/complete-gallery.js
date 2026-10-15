import {COMPOSITIONS,DESIGNS,MAX_IMAGES,createEntry,createLegacyEntry,comparisonBundle,validateQualityReview,parseCostUsd,gallerySummary,comparisonReport,projectOf,checkGenerationCapacity,revisionChecks} from './complete-gallery-model.js';
import {readComparisonFile} from './local-archive.js';
import {createImageSaveControls} from './image-save.js';
import {createSubjectRegionControls} from './subject-regions.js';
import {galleryStorage} from './complete-gallery-store.js';
import {diagnoseComplete,diagnosticText,validateCompleteImport,MAX_IMPORT_BYTES,createCompleteShareZip} from './complete-png-transfer.js';
export function createCompleteGallery({root,document=globalThis.document,storage=galleryStorage,download=downloadFile,confirm=message=>window.confirm(message),diagnose=diagnoseComplete,share=createCompleteShareZip,onRevise=()=>{},imageSaveControls=createImageSaveControls}={}){
 let state={groups:[],images:[],reviews:[]},selected='',width=360,sharing=false,project='',regionDisposers=[];
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;};
 const heading=el('h2','AI完成画像を見比べる'),intro=el('p','実際に生成した完成PNGを、同じ入力写真・タイトル・内容・見出しの作り方ごとに保存します。構図やデザインを変えて1枚ずつ作った結果を見比べられます。生成・自動学習はこの比較操作では行いません。'),feedback=el('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
 const select=el('select'),label=el('label','比較する組 ');label.append(select);select.setAttribute('aria-label','AI完成画像の比較する組');
 const projects=el('select'),projectLabel=el('label','動画・案件で絞り込む ');projects.setAttribute('aria-label','比較履歴の案件');projectLabel.append(projects);
 const refresh=el('button','保存一覧を更新');refresh.type='button';
 const toolbar=el('div');toolbar.className='preview-controls';const widthButtons=[];
 for(const size of [168,246,360]){const button=el('button',`${size}px`);button.type='button';button.addEventListener('click',()=>{width=size;for(const [n,b]of widthButtons)b.setAttribute('aria-pressed',String(n===width));renderImages();});toolbar.append(button);widthButtons.push([size,button]);button.setAttribute('aria-pressed',String(size===width));}
 const info=el('p'),source=el('div'),images=el('div');images.className='complete-gallery-images';
 const summary=el('pre');summary.className='complete-gallery-summary';
 const exportAll=el('button','全組の画像・記録・集計JSONを保存');exportAll.type='button';
 const exportZip=el('button','共有用ZIPを保存');exportZip.type='button';
 const shareNote=el('p','写真の重複を除き、画質と比較記録を保ったZIPを作ります。相手は展開して確認できます。作成は無料で、相手への送信は自分で行います。');
 const importFile=el('input'),importLabel=el('label','保存した写真・完成画像・比較記録のJSON・ZIPを読み込む');importFile.type='file';importFile.accept='.json,.zip,application/json,application/zip';importFile.setAttribute('aria-label','完成PNG比較JSONを読み込む');importLabel.append(importFile);
 const importStatus=el('p');importStatus.setAttribute('role','status');importStatus.setAttribute('aria-live','polite');
 const importNote=el('p','このアプリで保存したJSON・共有ZIPから、画像と記録をこのブラウザへ戻せます。読み込みは無料です。人の選択・利用確認・実費は保存された申告で、新しい確認や評価には数えません。編集途中の元写真・切り取り位置・入力欄は、上の下書きZIPで別に移します。APIキーは含みません。');
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
 const name=el('input'),rename=el('button','この組の案件名を変更'),nameLabel=el('label','案件名');name.maxLength=80;nameLabel.append(name);rename.type='button';actions.append(nameLabel,rename);
 root.replaceChildren(heading,intro,feedback,summary,projectLabel,exportZip,shareNote,exportAll,importLabel,importStatus,importNote,label,refresh,toolbar,info,source,images,form,actions);
 function scoped(){const groups=project?state.groups.filter(g=>projectOf(g)===project):state.groups,ids=new Set(groups.map(g=>g.id));return {groups,images:state.images.filter(x=>ids.has(x.groupId)),reviews:state.reviews.filter(x=>ids.has(x.groupId))};}
 function current(){return state.groups.find(x=>x.id===selected);}
 function outputs(){return state.images.filter(x=>x.groupId===selected).sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt)||a.id.localeCompare(b.id));}
 function renderImages(){
  for(const dispose of regionDisposers)dispose();regionDisposers=[];const candidates=outputs(),checks=revisionChecks(candidates);images.replaceChildren();candidates.forEach((image,i)=>{
   const name=`案${String.fromCharCode(65+i)}`,card=el('article'),title=el('h3',`${name}：${COMPOSITIONS[image.composition]??'以前の完成画像'}`),preview=el('img'),details=el('p'),link=el('a','この完成PNGを保存');
   preview.src=image.result.imageDataUrl;preview.alt=`AI完成画像の${name}`;preview.style.width=`min(100%,${width}px)`;preview.style.height='auto';preview.dataset.imageId=image.id;link.href=image.result.imageDataUrl;link.download=`ai-complete-${image.id}.png`;
   details.textContent=`${image.result.generation_version??'生成版不明'}・${image.elapsedMs===null?'生成時間不明':`${(image.elapsedMs/1000).toFixed(1)}秒`}・${image.design?`希望：${DESIGNS[image.design]}・`:''}未採点`;
   if(image.revision)details.textContent+=`\n修正指示：${image.revision.instruction}`;
   const check=checks.find(x=>x.imageId===image.id);if(check)details.textContent+=`\n${check.reason}\n修正元ID：${check.parentImageId}`;
   const revisionInput=el('textarea'),revise=el('button','この画像から修正を始める');revisionInput.rows=2;revisionInput.maxLength=300;revisionInput.placeholder='例：文字を穏やかに、主役を隠さない';revisionInput.setAttribute('aria-label',`${name}への修正指示`);revise.type='button';revise.disabled=!current()?.input;
   const revisionStatus=el('p');revise.addEventListener('click',async()=>{if(revise.disabled)return;revise.disabled=true;try{if(!revisionInput.value.trim())throw new Error('修正したい点を入力してください。');await onRevise({group:structuredClone(current()),image:structuredClone(image),instruction:revisionInput.value});revisionStatus.textContent='修正の入力を準備しました。上の生成ボタンで送信と課金を確認してから作成してください。まだAPIは呼んでいません。';}catch(error){revisionStatus.textContent=error.message;}finally{revise.disabled=!current()?.input;}});
   const record=el('form'),cost=el('input'),costLabel=el('label','この画像の実費（USD・任意）'),pngSave=el('select'),saveLabel=el('label','PNG保存を確認した結果'),button=el('button','実費と保存結果を記録'),status=el('p');
   record.className='complete-observation-form';record.noValidate=true;record.setAttribute('aria-label',`${name}の実費と保存結果`);cost.type='text';cost.inputMode='decimal';cost.maxLength=20;cost.placeholder='未確認は空欄';cost.value=image.observation?.costUsd===null||image.observation?.costUsd===undefined?'':String(image.observation.costUsd);cost.setAttribute('aria-label',`${name}の実費USD`);costLabel.append(cost);
   for(const [value,text]of [['unknown','未確認'],['saved','ファイル保存を確認できた'],['failed','ファイル保存できなかった']]){const option=el('option',text);option.value=value;pngSave.append(option);}pngSave.value=image.observation?.pngSave??'unknown';pngSave.setAttribute('aria-label',`${name}のPNG保存結果`);saveLabel.append(pngSave);button.type='submit';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   record.append(costLabel,saveLabel,button,status,el('p','実費は請求・利用履歴でこの生成分を確認した場合だけ入力してください。保存ボタンを押しただけでは成功と記録しません。'));
   record.addEventListener('submit',async event=>{event.preventDefault();if(button.disabled)return;button.disabled=true;try{const observation={version:1,recordedAt:new Date().toISOString(),costUsd:parseCostUsd(cost.value),pngSave:pngSave.value};state=await storage.observe(image.id,observation);renderSummary();status.textContent='実費と保存結果をブラウザ内に保存しました。追加料金はありません。';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
   const inspect=el('button','このPNGを無料で診断'),diagnosticStatus=el('p');inspect.type='button';diagnosticStatus.setAttribute('role','status');diagnosticStatus.setAttribute('aria-live','polite');
   inspect.addEventListener('click',async()=>{if(inspect.disabled)return;inspect.disabled=true;diagnosticStatus.textContent='このPC内でPNGを診断しています…';try{diagnosticStatus.textContent=diagnosticText(await diagnose(comparisonBundle(state,image.groupId),image.id),image.id);}catch(error){diagnosticStatus.textContent=`PNG診断に失敗しました：${error.message} 完成画像と比較記録は保持しています。`;}finally{inspect.disabled=false;}});
   const saveOptions=el('div');imageSaveControls({root:saveOptions,imageDataUrl:image.result.imageDataUrl,document,download});
   const regions=el('div');regionDisposers.push(createSubjectRegionControls({root:regions,group:current(),image,document,reviewerId:()=>reviewer.value,onSave:async value=>{state=await storage.subjectRegions(image.id,value);renderSummary();}}));
   card.append(title,preview,details,link,saveOptions,revisionInput,revise,revisionStatus,regions,el('p','診断はこのPC内で行います。外部AIへは送らず、課金もありません。'),inspect,diagnosticStatus,record);images.append(card);
  });
 }
 function renderSummary(){
  const report=gallerySummary(scoped()),seconds=value=>value===null?'不明':`${(value/1000).toFixed(1)}秒`;
  summary.textContent=`保存中：${report.images}枚 / ${report.groups}組\n選択記録：2枚以上の比較 ${report.comparedGroups}組 / 1枚の確認 ${report.singleImageReviews}組 / 案追加後の再確認待ち ${report.staleReviews}組\n20件の収集：保存中の人の比較 ${report.collection.humanComparisons}組 / 出典・利用確認済み実タイトルの比較 ${report.collection.authorizedRealComparisons}組\n生成時間：中央値 ${seconds(report.generationTime.medianMs)} / p95 ${seconds(report.generationTime.p95Ms)}（時間不明 ${report.generationTime.unknown}枚）\n確認済み実費：${report.cost.confirmedTotalUsd===null?'未確認':`${report.cost.confirmedTotalUsd} USD`}（実費不明 ${report.cost.unknownImages}枚）\nPNG保存：確認できた ${report.pngSave.saved}枚 / できなかった ${report.pngSave.failed}枚 / 未確認 ${report.pngSave.unknown}枚\n現在残っている成功画像だけの集計です。削除・失敗分は含みません。`;
  exportAll.disabled=!state.images.length;
  exportZip.disabled=sharing||!state.images.length;
  summary.textContent+=`\n絞り込み：${project||'全案件'} / 重複を除いた保存容量 ${(gallerySummary(state).storage.characters/1024/1024).toFixed(1)} / 192MiB（全体60枚・1案件24枚・1組12枚まで）`;
 }
 function render(){
  qualityFeedback.textContent='';
  renderSummary();
  const names=[...new Set(state.groups.map(projectOf))];if(project&&!names.includes(project))project='';projects.replaceChildren();const all=el('option','全案件');all.value='';projects.append(all);for(const value of names){const option=el('option',value);option.value=value;projects.append(option);}projects.value=project;
  select.replaceChildren();const groups=[...scoped().groups].sort((a,b)=>Date.parse(b.capturedAt)-Date.parse(a.capturedAt)||a.id.localeCompare(b.id));if(!groups.some(x=>x.id===selected))selected=groups[0]?.id??'';
  groups.forEach((g,i)=>{const option=el('option',g.input?`${i+1}：${g.input.title}`:'以前の完成画像（入力条件不明）');option.value=g.id;select.append(option);});select.value=selected;
  const group=current(),has=!!group;for(const node of [select,form,toolbar,actions,info,source])node.hidden=!has;
  name.value=group?projectOf(group):'';
  renderImages();source.replaceChildren();decision.replaceChildren(el('option','選んでください'));decision.children[0].value='';
  outputs().forEach((x,i)=>{const option=el('option',`案${String.fromCharCode(65+i)}`);option.value=x.id;decision.append(option);});const none=el('option','全部使わない');none.value='none';decision.append(none);
  const review=state.reviews.find(x=>x.groupId===selected);reviewer.value=review?.context?.reviewerId??'r01';titleSource.value=review?.context?.titleSource??'unknown';titlePermission.checked=review?.context?.titlePermissionConfirmed??false;photoPermission.checked=review?.context?.photoPermissionConfirmed??false;decision.value=review?(review.decision==='none_acceptable'?'none':review.imageId):'';reason.value=review?.reason??'';for(const input of issueInputs)input.checked=review?.issues.includes(input.value)??false;
  if(!group){feedback.textContent='生成済みの完成画像はまだありません。写真を使ってAI生成すると、ここへ追加します。';return;}
  if(group.input){const photo=el('img'),caption=el('p','この組でAPIへ送った写真'),photoLink=el('a','この入力写真を保存');photo.src=group.sourceImageDataUrl;photo.alt='この比較組の入力写真';photo.style.width='min(100%,246px)';photoLink.href=group.sourceImageDataUrl;photoLink.download=`source-${group.input.sourceSha256}.png`;source.append(caption,photo,photoLink);info.textContent=`動画タイトル：${group.input.title}\n動画の内容：${group.input.brief||'補足なし（動画タイトルから判断）'}\n仕上がりのイメージ：${group.input.visualIntent??'動画内容からAIに任せる'}\n${outputs().length}案。見出し：${group.input.headlineMode==='auto'?'AIに任せる（実際の文言は画像で確認）':group.input.headline}　構図・デザインを変えて手動生成した結果を比較します。自動見出しの組では、案ごとに文言も変わる可能性があります。写真・内容・イメージ・見出しの作り方が変わると別の組になります。`;}
  else info.textContent='復元した以前の完成画像です。生成時の入力写真・見出し・構図は記録されていないため、現在の入力と同じ組にはしません。';
  const currentReview=review&&comparisonBundle(state,selected).reviewCoversAllImages;
  feedback.textContent=`完成画像 ${state.images.length}/${MAX_IMAGES}枚をこのブラウザ内に保存しています。${currentReview?'この組の選択と理由は保存済みです。':review?'案が増えたため、以前の選択です。新しい案も比べて保存し直してください。':''}`;
 }
 async function reload(){state=await storage.load();render();}
 importFile.addEventListener('change',async()=>{
  const file=importFile.files?.[0];if(!file||importFile.disabled)return;
  importFile.disabled=true;importStatus.textContent='写真・完成画像と記録を確認しています…';
  try{
   if(!Number.isFinite(file.size)||file.size>MAX_IMPORT_BYTES)throw new Error('比較JSONは70MiB以下にしてください。');
   const value=await readComparisonFile(file);
   const bundles=await validateCompleteImport(value);
   await ready;state=await storage.import(bundles);project='';selected=bundles[0].group.id;render();
   importStatus.textContent='写真・完成画像・保存された比較記録を読み込みました。同じ画像は重複追加せず、API送信・追加料金はありません。';
  }catch(error){importStatus.textContent=`読み込めません：${error.message} 保存済みの画像と記録は保持しています。`;}
  finally{importFile.disabled=false;importFile.value='';}
 });
 refresh.addEventListener('click',()=>reload().catch(error=>feedback.textContent=`一覧を読み込めません：${error.message}`));
 select.addEventListener('change',()=>{selected=select.value;render();});
 projects.addEventListener('change',()=>{project=projects.value;selected='';render();});
 rename.addEventListener('click',async()=>{try{state=await storage.rename(selected,name.value);project='';render();feedback.textContent='案件名を保存しました。';}catch(error){feedback.textContent=error.message;}});
  form.addEventListener('submit',async event=>{event.preventDefault();if(save.disabled)return;save.disabled=true;try{const group=current();if(!group)throw new Error('比較する組がありません。');const review={version:1,groupId:group.id,recordedAt:new Date().toISOString(),decision:decision.value==='none'?'none_acceptable':'selected',imageId:decision.value==='none'?null:decision.value,reason:reason.value,issues:issueInputs.filter(x=>x.checked).map(x=>x.value),context:{version:1,reviewerId:reviewer.value.trim(),titleSource:titleSource.value,titlePermissionConfirmed:titlePermission.checked,photoPermissionConfirmed:photoPermission.checked},displayWidths:[...images.querySelectorAll('img')].map(x=>({imageId:x.dataset.imageId,width:x.getBoundingClientRect().width}))};validateQualityReview(review,group,state.images);state=await storage.review(review);render();qualityFeedback.textContent=feedback.textContent='この組の選択と理由をブラウザ内に保存しました。API送信・追加料金はありません。';}catch(error){qualityFeedback.textContent=feedback.textContent=error.message;}finally{save.disabled=false;}});
 exportButton.addEventListener('click',()=>{try{download(`${selected}.json`,JSON.stringify(comparisonBundle(state,selected),null,2),'application/json');feedback.textContent='写真・完成PNG・比較記録のJSONを出力しました。非公開で扱ってください。';}catch(error){feedback.textContent=error.message;}});
 exportAll.addEventListener('click',()=>{try{const body=JSON.stringify(comparisonReport(scoped()),null,2);if(new Blob([body]).size>MAX_IMPORT_BYTES)throw new Error('70MiBを超えています。案件で絞り込むか、組ごとに保存してください。');download('complete-comparison-report.json',body,'application/json');feedback.textContent='表示中の案件の写真・完成PNG・記録・集計を出力しました。非公開で扱ってください。';}catch(error){feedback.textContent=error.message;}});
 exportZip.addEventListener('click',async()=>{
  if(exportZip.disabled||sharing)return;sharing=true;renderSummary();feedback.textContent='写真と記録を確認し、共有用ZIPを作っています…';
  try{
   const result=await share(comparisonReport(scoped())),link=download('complete-comparison-share.zip',result.blob,'application/zip');
   feedback.textContent=`共有用ZIPを作成しました：${(result.zipBytes/1e6).toFixed(1)}MB（通常JSON ${(result.originalBytes/1e6).toFixed(1)}MB）。${result.images}枚・${result.groups}組、重複を除いた写真と完成PNG ${result.assets}枚。相手にはZIPをすべて展開してpreview.htmlを開くよう伝えてください。送信はまだ行っていません。`;
   if(link&&typeof link==='object'&&typeof link.click==='function'){link.textContent='ZIPをもう一度保存';feedback.append(link);}
  }catch(error){feedback.textContent=`共有用ZIPを作れません：${error.message} 保存済みの画像と比較記録は保持しています。通常のJSON保存も利用できます。`;}
  finally{sharing=false;renderSummary();}
 });
 remove.addEventListener('click',async()=>{if(!confirm('この組を比較一覧から削除しますか？ 必要なPNGとJSONは先に保存してください。編集下書きの最後の完成PNGは別に残ります。'))return;remove.disabled=true;try{state=await storage.remove(selected);selected='';render();}catch(error){feedback.textContent=error.message;}finally{remove.disabled=false;}});
 render();feedback.textContent='完成画像の比較一覧を読み込んでいます…';
 const ready=reload().catch(error=>{feedback.textContent=`比較保存を読み込めません：${error.message} 完成PNGはファイルにも保存してください。`;});
 return {ready,async preflight(payload,name){await ready;state=await storage.load();await checkGenerationCapacity(state,payload,name);},async remember(payload,data,options){await ready;const entry=await createEntry(payload,data,options);state=await storage.add(entry);selected=entry.group.id;render();return state.added;},async rememberLegacy(data){await ready;const entry=await createLegacyEntry(data);state=await storage.add(entry);if(state.groups.some(x=>x.id===entry.group.id))selected=entry.group.id;render();},async clear(){await ready;state=await storage.clear();selected='';render();}};
}
function downloadFile(name,body,type){
 const blob=new Blob([body],{type}),link=document.createElement('a');let url=null,timer;
 function prepare(){if(!url){url=URL.createObjectURL(blob);link.href=url;}clearTimeout(timer);timer=setTimeout(()=>{URL.revokeObjectURL(url);url=null;},60000);}
 link.download=name;link.textContent='ファイルを保存';link.addEventListener('click',prepare);prepare();link.click();return link;
}
