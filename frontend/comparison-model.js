export const STYLES=['bold','contrast','clean'];
export const PREFERENCE_FIELDS=['sample_id','title','genre','source','source_url','permission','permission_date','candidate_id','generation_version','scoring_version','reviewer_id','preferred_candidate','ranking','reason','split'];
const fail=message=>{throw new Error(message);};
export function validateSet(set){
 if(!set||set.version!==1||typeof set.id!=='string'||set.id.length>100||!set.id||!['demo','ai_background'].includes(set.mode))fail('比較セットの形式が不正です。');
 if(typeof set.input?.title!=='string'||[...set.input.title].length<1||[...set.input.title].length>60||/[\u0000-\u001f]/.test(set.input.title)||!['education','gaming','vlog','other'].includes(set.input.genre))fail('タイトル・ジャンルが不正です。');
 if(!Number.isFinite(set.elapsedMs)||set.elapsedMs<0||!Array.isArray(set.candidates)||set.candidates.length!==3)fail('3候補と所要時間が必要です。');
 if(new Set(set.candidates.map(c=>c.style)).size!==3||set.candidates.some(c=>!STYLES.includes(c.style))||new Set(set.candidates.map(c=>c.id)).size!==3)fail('異なる3案が必要です。');
 let bytes=0;
 for(const c of set.candidates){
  if(typeof c.id!=='string'||!c.id||c.width!==1280||c.height!==720||c.mimeType!=='image/svg+xml')fail('候補の寸法・形式が不正です。');
  if(typeof c.imageDataUrl!=='string'||!/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/.test(c.imageDataUrl)||c.imageDataUrl.length>20*1024*1024)fail('画像データが不正または大きすぎます。');
  bytes+=c.imageDataUrl.length;const svg=atob(c.imageDataUrl.split(',')[1]);
  if(!/<svg[\s>]/i.test(svg)||/<(?:script|style|foreignObject|iframe|object|embed)\b|\son\w+\s*=|<!DOCTYPE|<!ENTITY|@import/i.test(svg)||/\b(?:href|src)\s*=\s*['"](?!data:image\/(?:png|jpeg|webp);base64,|#)[^'"]+/i.test(svg)||/url\(\s*['"]?(?!#)[^)]+/i.test(svg))fail('外部参照や実行内容を含むSVGは読み込めません。');
  const a=c.assessment;
  if(!a||typeof a.version!=='string'||!/^0\.4\.(0|[1-9][0-9]*)$/.test(a.version)||a.kind!=='layout_heuristic'||!Array.isArray(a.unevaluated)||!a.weights||!a.metrics)fail('採点0.4.xの候補が必要です。');
  const keys=['contrast','brevity','font','fit'],weights=a.weights;let missing=0,lower=0;
  if(Object.keys(weights).length!==keys.length||!keys.every(key=>Number.isInteger(weights[key])&&weights[key]>=0&&weights[key]<=100)||keys.reduce((total,key)=>total+weights[key],0)!==100||Object.keys(a.metrics).length!==keys.length)fail('採点の重みは4項目の整数で、合計100が必要です。');
  for(const key of keys){const weight=weights[key],value=a.metrics[key];if(!(value===null||Number.isInteger(value)&&value>=0&&value<=100)||(value===null)!==a.unevaluated.includes(key))fail('採点の内訳が契約と一致しません。');if(value===null)missing+=weight;else lower+=value*weight/100;}
  if(a.unevaluated.length!==new Set(a.unevaluated).size||a.unevaluated.some(k=>!keys.includes(k))||a.overall!==Math.round(lower)||a.overallMax!==Math.round(lower+missing)||a.coverage!==100-missing)fail('採点の上下限・評価範囲が不正です。');
  if(typeof c.metadata?.generation_version!=='string'||!c.metadata.generation_version)fail('生成バージョンがありません。');
 }
 if(bytes>50*1024*1024)fail('比較セットが大きすぎます。');
 return set;
}
export function freezeComparison(response,id,date=new Date().toISOString()){
 // Copy only the fields needed for local comparison; no API credentials or permission guesses.
 const set={version:1,id,createdAt:date,mode:response.mode,input:{title:response.input.title,genre:response.input.genre},elapsedMs:response.elapsedMs,candidates:response.candidates.map(c=>({id:c.id,style:c.style,width:c.width,height:c.height,mimeType:c.mimeType,imageDataUrl:c.imageDataUrl,metadata:Object.fromEntries(['generation_version','textLength','lineCount','fontSize','foreground','background','textLayout'].filter(key=>c.metadata?.[key]!==undefined).map(key=>[key,c.metadata[key]])),assessment:c.assessment}))};
 return validateSet(JSON.parse(JSON.stringify(set)));
}
export async function splitFor(sampleId){const bytes=new TextEncoder().encode(sampleId);const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));return hash[0]<77?'holdout':'dev';}
export function validateReview(review,set){
 validateSet(set);
 if(review.setId!==set.id||!/^s[0-9]{3,}$/.test(review.sampleId)||!/^r[0-9]{2,}$/.test(review.reviewerId))fail('組ID・サンプルID・評価者IDを確認してください。');
 if(!['selected','none_acceptable'].includes(review.decision)||review.decision==='selected'&&!STYLES.includes(review.preferred)||review.decision==='none_acceptable'&&review.preferred!==null)fail('選択結果が不正です。');
 if(!['own_work','owner_consented','none'].includes(review.permission)||!['dev','holdout'].includes(review.split)||!['original','owner_material','synthetic'].includes(review.source))fail('許諾・出典・分割を確認してください。');
 if(typeof review.sourceUrl!=='string'||review.sourceUrl.length>2000||review.sourceUrl&&!/^https?:\/\//i.test(review.sourceUrl))fail('出典URLはHTTPまたはHTTPSで指定してください。');
 if(review.permission!=='none'&&(!/^\d{4}-\d{2}-\d{2}$/.test(review.permissionDate)||!Number.isFinite(Date.parse(review.permissionDate))||new Date(review.permissionDate).toISOString().slice(0,10)!==review.permissionDate||review.permissionConfirmed!==true))fail('許諾・出典を人が確認し、確認日を入力してください。');
 if(typeof review.reason!=='string'||review.reason.length>1000||!['text','composition','material','other','none'].includes(review.failureCategory))fail('理由・失敗分類が不正です。');
 if(review.ranking&&(!STYLES.every(s=>review.ranking.split('>').includes(s))||review.ranking.split('>').length!==3||review.decision==='selected'&&review.ranking.split('>')[0]!==review.preferred))fail('順位は3案を一度ずつ含み、選んだ案を1位にしてください。');
 if(!Number.isFinite(review.displayWidth)||review.displayWidth<=0||typeof review.os!=='string'||!review.os.trim()||typeof review.browser!=='string'||!review.browser.trim())fail('実際の表示幅・OS・ブラウザを記録してください。');
 if(!(review.costUsd===null||Number.isFinite(review.costUsd)&&review.costUsd>=0)||!['unknown','yes','no'].includes(review.saved))fail('実費・保存確認が不正です。');
 return review;
}
const groupKey=c=>JSON.stringify({unevaluated:[...c.assessment.unevaluated].sort(),version:c.assessment.version,weights:['contrast','brevity','font','fit'].map(key=>c.assessment.weights[key])});
export function comparable(set){return new Set(set.candidates.map(groupKey)).size===1;}
export function compareReview(review,set){
 validateReview(review,set);
 if(review.decision==='none_acceptable')return {status:'rejected',pairs:null};
 if(!comparable(set))return {status:'different_coverage',pairs:null};
 const scores=Object.fromEntries(set.candidates.map(c=>[c.style,c.assessment.overall])),top=Math.max(...Object.values(scores)),tops=STYLES.filter(s=>scores[s]===top);
 const status=tops.includes(review.preferred)?tops.length===1?'hit':'tie':'miss';let pairs=null;
 if(review.ranking){pairs={concordant:0,discordant:0,tied:0};const order=review.ranking.split('>');for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const delta=scores[order[i]]-scores[order[j]];pairs[delta>0?'concordant':delta<0?'discordant':'tied']++;}}
 return {status,pairs};
}
export function partnerRows(reviews,sets){
 const preferences=[],scores=[],excluded=[];const exported=new Set();
 for(const review of reviews){const set=sets.find(s=>s.id===review.setId);try{if(!set)fail('画像セットなし');validateReview(review,set);}catch(error){excluded.push({setId:review.setId,reason:error.message});continue;}
  if(review.permission==='none'||!review.permissionConfirmed||review.source==='synthetic'||review.decision!=='selected'||!comparable(set)){excluded.push({setId:set.id,reason:'許諾未確認・人工データ・全案不採用・評価範囲違いのいずれか'});continue;}
  const generation=new Set(set.candidates.map(c=>c.metadata.generation_version)),versions=new Set(set.candidates.map(c=>c.assessment.version));if(generation.size!==1||versions.size!==1){excluded.push({setId:set.id,reason:'候補のバージョンが混在'});continue;}
  preferences.push({sample_id:review.sampleId,title:set.input.title,genre:set.input.genre,source:review.source,source_url:review.sourceUrl,permission:review.permission,permission_date:review.permissionDate,candidate_id:set.id,generation_version:[...generation][0],scoring_version:[...versions][0],reviewer_id:review.reviewerId,preferred_candidate:review.preferred,ranking:review.ranking,reason:review.reason,split:review.split});
  if(!exported.has(set.id)){exported.add(set.id);for(const c of set.candidates)scores.push({candidate_id:set.id,style:c.style,overall:String(c.assessment.overall),scoring_version:c.assessment.version});}
 }
 return {preferences,scores,excluded};
}
export function csv(fields,rows){return '\uFEFF'+[fields,...rows.map(row=>fields.map(k=>row[k]??''))].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');}
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]:null;
export function summarizeReviews(reviews,sets){
 const valid=[],invalid=[];for(const r of reviews){const s=sets.find(s=>s.id===r.setId);try{if(!s)fail('セットなし');validateReview(r,s);valid.push({r,s,result:compareReview(r,s)});}catch(e){invalid.push({setId:r.setId,reason:e.message});}}
 const eligible=valid.filter(({r})=>r.permission!=='none'&&r.permissionConfirmed&&r.source!=='synthetic');
 const unique=new Set(eligible.map(({r})=>r.sampleId));
 const aggregate=(split,sourceRows=eligible)=>{const rows=sourceRows.filter(({r,result})=>r.split===split&&['hit','tie','miss'].includes(result.status));const counts=Object.fromEntries(['hit','tie','miss'].map(k=>[k,rows.filter(x=>x.result.status===k).length]));const pairs=rows.reduce((a,x)=>{for(const k of Object.keys(a))a[k]+=x.result.pairs?.[k]??0;return a;},{concordant:0,discordant:0,tied:0});return {n:rows.length,...counts,hitRate:rows.length?counts.hit/rows.length:null,pairs};};
 const usedSets=sets.filter(s=>valid.some(({r})=>r.setId===s.id));
 const costs=usedSets.map(s=>{const values=[...new Set(valid.filter(x=>x.s.id===s.id&&x.r.costUsd!==null).map(x=>x.r.costUsd))];return values.length===1?values[0]:null;});
 const savedSets=usedSets.map(s=>{const values=[...new Set(valid.filter(x=>x.s.id===s.id&&x.r.saved!=='unknown').map(x=>x.r.saved))];return values.length===1?values[0]:'unknown';});
 const failures=Object.fromEntries(['text','composition','material','other','none'].map(k=>[k,eligible.filter(x=>x.r.failureCategory===k).length]));
 return {progress:{completed:unique.size,target:20,remaining:Math.max(0,20-unique.size),humanCompleted:new Set(valid.map(({r})=>r.sampleId)).size,humanRemaining:Math.max(0,20-new Set(valid.map(({r})=>r.sampleId)).size)},reviews:valid.length,invalid,agreement:{dev:aggregate('dev'),holdout:aggregate('holdout')},practiceAgreement:{dev:aggregate('dev',valid.filter(x=>x.r.source==='synthetic')),holdout:aggregate('holdout',valid.filter(x=>x.r.source==='synthetic'))},rejected:eligible.filter(x=>x.result.status==='rejected').length,incomparable:eligible.filter(x=>x.result.status==='different_coverage').length,failureCategories:failures,generation:{sets:usedSets.length,medianMs:percentile(usedSets.map(s=>s.elapsedMs),0.5),p95Ms:percentile(usedSets.map(s=>s.elapsedMs),0.95),knownCostUsd:costs.filter(v=>v!==null).reduce((a,b)=>a+b,0),unknownCostSets:costs.filter(v=>v===null).length,saveYes:savedSets.filter(v=>v==='yes').length,saveNo:savedSets.filter(v=>v==='no').length,saveUnknown:savedSets.filter(v=>v==='unknown').length},note:'少人数の参考値。completedは利用確認済み実タイトル数、humanCompletedは練習用も含む人の比較件数です。同点は一致率に含めず、評価範囲違いは順位比較しません。holdoutは調整に使いません。生成失敗の試行はこの集計に含まず成功率は算出できません。'};
}
