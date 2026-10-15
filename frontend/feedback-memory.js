import {FEEDBACK_VERSION,FEEDBACK_ISSUES,MAX_FEEDBACK_RECORDS,normalizeGenerationFeedback,normalizeFeedbackSettings} from '../shared/generation-feedback.mjs';
import {projectOf,validateQualityReview} from './complete-gallery-model.js';
import {splitForId} from '../shared/evaluation-split.mjs';
const labels={text:'文字の雰囲気・読みやすさ',subject:'人物・素材の保持',composition:'構図',other:'その他'};
export const feedbackRecordKey=record=>record.groupId+'|'+record.recordedAt;
export async function buildGenerationFeedback(state,context,settings){
 const options=normalizeFeedbackSettings(settings),projectName=(context.projectName||context.title||'').trim();
 if(!options.enabled||options.scope==='project'&&!projectName)return null;
 const records=[];
 for(const review of [...state.reviews].sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt)||a.groupId.localeCompare(b.groupId))){
  const group=state.groups.find(g=>g.id===review.groupId),images=state.images.filter(i=>i.groupId===review.groupId);
  if(!group?.input||review.context?.reviewerId!==options.reviewerId||options.excluded.includes(feedbackRecordKey(review))||options.scope==='project'&&projectOf(group).trim()!==projectName)continue;
  // A stale/invalid review is not attributed to a later image or silently treated as a comparison.
  try{validateQualityReview(review,group,images);}catch{continue;}
  if(await splitForId(group.id)==='holdout')continue;
  if(!review.reason.trim()&&!review.issues.length)continue;
  const chars=[...review.reason.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu,' ')],reason=chars.length>500?chars.slice(0,499).join('')+'…':chars.join('');
  records.push({groupId:group.id,recordedAt:review.recordedAt,decision:review.decision,selectedImageId:review.imageId,reason,reasonTruncated:chars.length>500,issues:[...review.issues],images:images.map(image=>({imageId:image.id,imageSha256:image.imageSha256,generationVersion:image.result.generation_version??null}))});
  if(records.length===MAX_FEEDBACK_RECORDS)break;
 }
 while(records.length){try{return normalizeGenerationFeedback({version:FEEDBACK_VERSION,scope:options.scope,projectName:options.scope==='all'?null:projectName,reviewerId:options.reviewerId,records,criteria:FEEDBACK_ISSUES.filter(issue=>records.some(r=>r.issues.includes(issue)))});}catch(error){if(error.message.includes('大きすぎ')){records.pop();continue;}throw error;}}
 return null;
}
export function feedbackText(value){if(!value)return '今回使える評価メモはありません。理由・気になる点・評価者IDを保存すると、次の生成で参照できます。';return `${value.records.length}件の記録を使います。${value.scope==='project'?`案件：${value.projectName}`:'全案件'} / 評価者：${value.reviewerId}\n`+value.records.map((r,i)=>`${i+1}. ${r.decision==='selected'?'採用した案の評価':'全部使わなかった組の評価'}：${r.reason||'理由なし'}${r.reasonTruncated?'（抜粋）':''}\n気になる点：${r.issues.map(x=>labels[x]).join(' / ')||'なし'}`).join('\n\n')+`\n\n今回の確認ポイント：${value.criteria.map(x=>labels[x]).join(' / ')||'保存された理由との相性'}`;}
export function createFeedbackMemory({root,readHistory,context,onChange=()=>{},document=globalThis.document}){
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;},enabled=el('input'),all=el('input'),reviewer=el('input'),preview=el('pre'),choices=el('div'),status=el('p'),refreshButton=el('button','評価メモを更新');
 enabled.type=all.type='checkbox';enabled.checked=true;reviewer.value='r01';reviewer.maxLength=40;reviewer.setAttribute('aria-label','生成に反映する評価者ID');refreshButton.type='button';
 const enableLabel=el('label','保存した評価を次の生成に反映する'),allLabel=el('label','別の案件の評価も使う'),reviewerLabel=el('label','自分の評価者ID');enableLabel.prepend(enabled);allLabel.prepend(all);reviewerLabel.append(reviewer);
 preview.style.whiteSpace='pre-wrap';preview.setAttribute('aria-label','次の生成へ送る評価メモ');status.setAttribute('role','status');
 root.replaceChildren(el('h3','過去の評価を次の生成へ'),enableLabel,el('p','このブラウザに保存した自分の評価のうち、調整用devの最大6組の理由を使います。約3割のholdoutは効果確認用としてメモに使いません。メモ作成は無料で、モデルの再学習や品質点数の更新は行いません。'),el('p','有料生成すると、表示された評価理由もOpenAIへ送ります。第三者の名前・連絡先などは理由に書かないでください。'),reviewerLabel,allLabel,refreshButton,preview,choices,status);
 let excluded=[],run=0;
 const settings=()=>normalizeFeedbackSettings({enabled:enabled.checked,scope:all.checked?'all':'project',reviewerId:reviewer.value.trim(),excluded});
 function render(value){preview.textContent=feedbackText(value);choices.replaceChildren();for(const record of value?.records??[]){const input=el('input'),label=el('label',`この記録を使う：${record.reason||record.issues.map(x=>labels[x]).join(' / ')}`);input.type='checkbox';input.checked=true;label.prepend(input);choices.append(label);input.addEventListener('change',()=>{const key=feedbackRecordKey(record);excluded=input.checked?excluded.filter(x=>x!==key):[...new Set([...excluded,key])].slice(-60);onChange();refresh();});}if(excluded.length){const reset=el('button','外した記録を戻す');reset.type='button';reset.addEventListener('click',()=>{excluded=[];onChange();refresh();});choices.append(reset);}}
 async function snapshot(ctx=context(),options=settings()){if(!options.enabled)return null;return buildGenerationFeedback(await readHistory(),ctx,options);}
 async function refresh(){const id=++run;try{const value=await snapshot();if(id!==run)return;render(value);status.textContent=enabled.checked?(value?'表示した評価メモを、次の有料生成と一緒に送ります。':'対象の評価がないため、次の生成には評価メモを付けません。'):'評価メモは無効です。次の生成へ送りません。';}catch(error){if(id===run){preview.textContent='評価メモを確認できません。';status.textContent=error.message;}}}
 for(const node of [enabled,all,reviewer])node.addEventListener(node===reviewer?'input':'change',()=>{onChange();refresh();});refreshButton.addEventListener('click',refresh);
 return {refresh,settings,restore(value){const options=normalizeFeedbackSettings(value);enabled.checked=options.enabled;all.checked=options.scope==='all';reviewer.value=options.reviewerId;excluded=options.excluded;refresh();},async prepare(ctx){const options=settings(),value=await snapshot({...ctx},options);run++;render(value);return value;}};
}
