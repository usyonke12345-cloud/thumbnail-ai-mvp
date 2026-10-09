import {validateSet,partnerRows,csv,PREFERENCE_FIELDS,summarizeReviews} from './comparison-model.js';
import {listSets,listReviews,saveSet,saveReview} from './comparison-store.js';
const $=id=>document.getElementById(id);let sets=[],reviews=[],current=null;let busy=false;
const message=text=>{$('status').textContent=text;$('review-feedback').textContent=text;};
const requiredLabels={sample:'サンプルID（s001など）',reviewer:'評価者ID（r01など）',source:'入力タイトルの由来',decision:'選択',os:'OS',browser:'ブラウザ','source-url':'出典URL',cost:'実費'};
function detectedEnvironment(){const ua=typeof navigator==='undefined'?'':navigator.userAgent??'';const os=/Windows/i.test(ua)?'Windows（バージョン未確認）':/Android/i.test(ua)?'Android（バージョン未確認）':/iPhone|iPad/i.test(ua)?'iOS / iPadOS（バージョン未確認）':/Macintosh/i.test(ua)?'macOS（バージョン未確認）':/Linux/i.test(ua)?'Linux（バージョン未確認）':'';let browser='';for(const [pattern,name] of [[/Edg\/([\d.]+)/,'Edge'],[/Firefox\/([\d.]+)/,'Firefox'],[/Chrome\/([\d.]+)/,'Chrome系'],[/Version\/([\d.]+).*Safari\//,'Safari']]){const match=ua.match(pattern);if(match){browser=`${name} ${match[1]}`;break;}}return {os,browser};}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.textContent=`${name}の保存リンク`;$('export-note').replaceChildren(a);a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function draw(){current=sets.find(s=>s.id===$('sets').value);$('review-images').replaceChildren();$('bundle').disabled=!current;$('save-review').disabled=!current;$('review-form').hidden=!current;if(!current){message('保存した3案がありません。生成画面で「この3案を固定保存」を押してから「保存一覧を更新」を押してください。');return;}
 const width=Number($('width').value);for(const c of current.candidates){const card=document.createElement('article'),heading=document.createElement('h2'),img=document.createElement('img'),save=document.createElement('a');heading.textContent=c.style;img.src=c.imageDataUrl;img.alt=`${c.style}：${current.input.title}`;img.style.width=`min(100%, ${width}px)`;img.dataset.style=c.style;save.href=c.imageDataUrl;save.download=`${current.id}-${c.style}.svg`;save.textContent='この固定SVGを保存';card.append(heading,img,save);$('review-images').append(card);}
 const reviewer=$('reviewer').value,os=$('os').value,browser=$('browser').value,detected=detectedEnvironment();$('review-form').reset();$('reviewer').value=reviewer||'r01';$('os').value=os||detected.os;$('browser').value=browser||detected.browser;
 let number=1;while(reviews.some(r=>r.sampleId===`s${String(number).padStart(3,'0')}`))number++;$('sample').value=reviews.find(r=>r.setId===current.id)?.sampleId??`s${String(number).padStart(3,'0')}`;
 if(current.mode==='demo')$('cost').value='0';message(`${current.input.title} / 組ID ${current.id}。画像・バージョンは固定です。`);
}
function showSummary(){const summary=summarizeReviews(reviews,sets);$('progress').textContent=`人による比較：${summary.progress.humanCompleted} / 20件 ／ 利用確認済み実タイトル：${summary.progress.completed} / 20件`;$('summary').textContent=JSON.stringify(summary,null,2);}
async function refresh(selected){sets=await listSets();reviews=await listReviews();$('sets').replaceChildren();for(const s of sets){const option=document.createElement('option');option.value=s.id;option.textContent=`${s.input.title} — ${s.id}`;$('sets').append(option);}if(selected)$('sets').value=selected;draw();showSummary();}
const exported=()=>partnerRows(reviews.filter(r=>Math.round(r.displayWidth)===Number($('width').value)),sets);
$('sets').addEventListener('change',draw);$('width').addEventListener('change',()=>{const elements=$('review-images').querySelectorAll('img');for(const img of elements)img.style.width=`min(100%, ${Number($('width').value)}px)`;message('同じ画像の表示幅を変更しました。実際の幅は記録時に測ります。');});
$('refresh').addEventListener('click',async()=>{if(busy)return;try{await refresh($('sets').value);}catch(e){message(`保存一覧を読めませんでした：${e.message}`);}});
$('bundle').addEventListener('click',()=>{if(current)download(`${current.id}.json`,JSON.stringify(current),'application/json');});
$('next').addEventListener('click',()=>{const next=sets.find(s=>!reviews.some(r=>r.setId===s.id&&r.reviewerId===$('reviewer').value.trim()));if(next){$('sets').value=next.id;draw();}else message('現在の評価者で未記録のセットはありません。新しいタイトルで3案を作り、固定保存してください。');});
$('import').addEventListener('change',async()=>{const file=$('import').files[0];if(!file)return;try{if(file.size>64*1024*1024)throw new Error('ファイルは64MB以下にしてください。');const set=validateSet(JSON.parse(await file.text()));await saveSet(set);await refresh(set.id);message('同じ画像セットを保存しました。許諾と人の評価は別に記録してください。');}catch(e){message(e.message);}finally{$('import').value='';}});
$('review-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!current){message('先に3案を固定保存し、保存セットを選んでください。');return;}
 if(busy){message('保存中です。完了までお待ちください。');return;}
 if(!$('review-form').checkValidity()){const invalid=$('review-form').querySelector(':invalid');message(`${requiredLabels[invalid?.id]??'入力項目'}を確認してください。${invalid?.validationMessage??''}`);invalid?.focus();return;}
 busy=true;$('save-review').disabled=true;message('人の評価を保存しています…');
 try{
  const set=current,decision=$('decision').value,width=$('review-images').querySelector('img').getBoundingClientRect().width;
  const review={setId:set.id,sampleId:$('sample').value.trim(),reviewerId:$('reviewer').value.trim(),source:$('source').value,sourceUrl:$('source-url').value.trim(),permission:$('permission').value,permissionDate:$('permission-date').value,permissionConfirmed:$('permission-confirmed').checked,decision:decision==='none'?'none_acceptable':'selected',preferred:decision==='none'?null:decision,ranking:$('ranking').value,reason:$('reason').value.trim(),failureCategory:$('failure').value,displayWidth:width,os:$('os').value.trim(),browser:$('browser').value.trim(),costUsd:$('cost').value===''?null:Number($('cost').value),saved:$('saved').value,recordedAt:new Date().toISOString()};
  await saveReview(review,set);reviews=await listReviews();showSummary();message('人の評価をブラウザ内へ保存しました。APIは呼んでいません。');
 }catch(e){message(e.message);}finally{busy=false;$('save-review').disabled=!current;}
});
$('export-report').addEventListener('click',()=>download('comparison-report.json',JSON.stringify({version:1,sets:sets.map(({candidates,...set})=>({...set,candidates:candidates.map(({imageDataUrl,...c})=>c)})),reviews,summary:summarizeReviews(reviews,sets)},null,2),'application/json'));
function exportCsv(kind){const rows=exported();const fields=kind==='preferences'?PREFERENCE_FIELDS:['candidate_id','style','overall','scoring_version'];download(`${kind}.csv`,csv(fields,rows[kind]),'text/csv;charset=utf-8');const note=document.createElement('p');note.textContent=`出力 ${rows[kind].length}行。除外 ${rows.excluded.length}評価（人工・未確認・不採用・評価範囲違いなど）。実際の幅が指定幅と異なる記録も除外します。CSVは表計算ソフトで文字列として読み込んでください。`;$('export-note').append(note);}
$('export-preferences').addEventListener('click',()=>exportCsv('preferences'));$('export-scores').addEventListener('click',()=>exportCsv('scores'));
refresh().catch(e=>message(`保存データを読めませんでした：${e.message}`));
