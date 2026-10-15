import {writeZip,utf8,hashBytes,fromDataUrl} from './local-archive.js';
import {normalizeVisualIntent,normalizeVideoBrief} from '../shared/complete-designs.mjs';

export function validationACase(value){
 if(value==null)return null;
 if(value.version!=='validation-a-case-1.0.0'||!/^validation-a-[a-f0-9]{64}$/.test(value.caseId)||!Number.isFinite(Date.parse(value.createdAt))||value.hypothesis!=='A'||!value.input||!value.source||!value.service||value.service.feedbackUsed!==false||value.service.revisionUsed!==false||typeof value.servicePrompt!=='string'||value.servicePrompt.length>30000||typeof value.chatgptPrompt!=='string'||value.chatgptPrompt.length>5000||value.source.path!=='source.png'||value.source.width!==1280||value.source.height!==720||![value.requestSha256,value.source.sha256,value.service.sourceSha256,value.servicePromptSha256].every(x=>/^[a-f0-9]{64}$/.test(x)))throw new Error('A検証の固定記録が不正です。固定し直してください。');
 const pick=(object,keys)=>Object.fromEntries(keys.map(key=>[key,object[key]])),input=pick(value.input,['title','brief','visualIntent','headlineMode','headline','design','composition']);
 if(typeof input.title!=='string'||!input.title.trim()||[...input.title].length>120||!['auto','manual'].includes(input.headlineMode)||!['auto','photo_focus','editorial','impact'].includes(input.design)||!['auto','text_left','text_right','text_top'].includes(input.composition)||input.headlineMode==='auto'&&input.headline!==null||input.headlineMode==='manual'&&(typeof input.headline!=='string'||!input.headline.trim()||[...input.headline].length>80)||!Number.isInteger(value.source.bytes)||value.source.bytes<24||value.source.bytes>2359296)throw new Error('A検証の固定入力が不正です。');
 normalizeVideoBrief(input.brief);normalizeVisualIntent(input.visualIntent);
 const service=pick(value.service,['generationVersion','model','n','size','quality','output_format','endpoint','feedbackUsed','revisionUsed','files','sourceSha256','nodeVersion']);
 if(!Array.isArray(value.service.files)||value.service.files.length>64||value.service.files.some(f=>!f||typeof f.path!=='string'||f.path.length>200||!/^[a-zA-Z0-9_./-]+$/.test(f.path)||f.path.startsWith('/')||f.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(f.sha256))||['generationVersion','model','nodeVersion'].some(k=>typeof service[k]!=='string'||service[k].length>100)||service.n!==1||service.size!=='1536x864'||service.quality!=='medium'||service.output_format!=='png'||service.endpoint!=='images/edits')throw new Error('A検証の生成設定が不正です。');
 service.files=value.service.files.map(f=>pick(f,['path','sha256']));
 // Whitelist nested properties too: draft transfers never retain credentials.
 return {version:value.version,caseId:value.caseId,createdAt:value.createdAt,hypothesis:'A',input,source:pick(value.source,['path','sha256','bytes','width','height']),requestSha256:value.requestSha256,service,servicePromptSha256:value.servicePromptSha256,servicePrompt:value.servicePrompt,chatgptPrompt:value.chatgptPrompt};
}
export async function assertValidationAInput(value,payload){
 const fixed=validationACase(value);if(!fixed)return;
 if('feedback' in payload||'revision' in payload)throw new Error('A検証では評価メモ・修正元を使えません。');
 const input={title:payload.title,brief:normalizeVideoBrief(payload.brief),visualIntent:normalizeVisualIntent(payload.visualIntent),headlineMode:payload.headlineMode??'manual',headline:(payload.headlineMode??'manual')==='auto'?null:payload.headline,design:payload.design??'auto',composition:payload.composition??'auto'};
 const sourceSha256=await hashBytes(fromDataUrl(payload.imageDataUrl));
 if(await hashBytes(utf8(JSON.stringify({input,sourceSha256})))!==fixed.requestSha256)throw new Error('写真・タイトル・イメージ・設定が固定時と変わりました。別ケースとして固定し直してください。');
}
export async function validationAZip(value,imageDataUrl){
 const fixed=validationACase(value),photo=fromDataUrl(imageDataUrl);
 await assertValidationAInput(fixed,{...fixed.input,imageDataUrl});
 if(await hashBytes(utf8(JSON.stringify(fixed.service.files)))!==fixed.service.sourceSha256||'validation-a-'+await hashBytes(utf8(JSON.stringify({requestSha256:fixed.requestSha256,service:fixed.service,servicePromptSha256:fixed.servicePromptSha256})))!==fixed.caseId)throw new Error('A検証の固定IDと生成設定が一致しません。');
 if(photo.length!==fixed.source.bytes||await hashBytes(photo)!==fixed.source.sha256||await hashBytes(utf8(fixed.servicePrompt))!==fixed.servicePromptSha256)throw new Error('A検証の写真または指示のハッシュが一致しません。');
 return writeZip([
  {name:'source.png',data:photo},
  {name:'validation-a.json',data:utf8(JSON.stringify(fixed,null,2))},
  {name:'chatgpt-prompt.txt',data:utf8(fixed.chatgptPrompt)},
  {name:'service-prompt.txt',data:utf8(fixed.servicePrompt)},
  {name:'README.txt',data:utf8('A検証の固定入力です。source.pngをChatGPTの新しい会話へ添付し、chatgpt-prompt.txtをそのまま送ってください。サービスは評価メモなし・修正なし。双方の最初の1枚を保存し、失敗も残します。これらのファイルを保存しただけでは画像生成・比較・許諾確認は行われません。モデル設定と実行コードのSHA-256はvalidation-a.jsonにあります。同一画像の再現を保証するものではありません。写真と入力内容を含むため非公開で扱ってください。完成画像・人の評価・実費は別に記録します。このZIPは入力の照合用で、サイトへの復元用ではありません。下書きの移行には既存の下書きZIPを併せて保存してください。')}
 ]);
}
export function createValidationA({root,capture,download,onChange=()=>{},onFreeze=()=>{},onRelease=()=>{},isBusy=()=>false,document=globalThis.document,fetchImpl=(...args)=>fetch(...args)}){
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;},freeze=el('button','A検証の入力を固定してZIP保存（無料）'),release=el('button','固定を解除'),status=el('p'),summary=el('pre');
 freeze.type=release.type='button';summary.style.whiteSpace='pre-wrap';status.setAttribute('role','status');
 root.replaceChildren(el('h3','A検証：最初の1枚を比べる'),el('p','今の写真・タイトル・仕上がりのイメージ・設定を固定し、ChatGPTにも同じ写真と条件を渡します。固定中は評価メモを使いません。固定保存では有料APIを呼びません。'),freeze,release,summary,status);
 let fixed=null;
 function render(){release.disabled=!fixed;summary.textContent=fixed?`固定ID：${fixed.caseId}\n動画タイトル：${fixed.input.title}\n補足：${fixed.input.brief||'なし'}\nイメージ：${fixed.input.visualIntent||'指定なし'}\n見出し：${fixed.input.headlineMode==='auto'?'AIに任せる':fixed.input.headline}\nデザイン：${fixed.input.design} / 構図：${fixed.input.composition}\n${fixed.service.generationVersion} / ${fixed.service.model} / ${fixed.service.quality} / ${fixed.service.size}\n評価メモ：オフ / 固定後の写真・条件変更は生成前に停止します。`:'まだ入力を固定していません。写真と動画タイトルを用意してください。';}
 freeze.addEventListener('click',async()=>{
  if(isBusy())return;freeze.disabled=true;
  try{const payload=await capture();if(payload.revision)throw new Error('最初の1枚の検証です。「修正をやめる」で通常生成へ戻してください。');const {consent,...input}=payload;
   const response=await fetchImpl('/api/v1/validation-a/freeze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),data=await response.json();if(!response.ok)throw new Error(data.error?.message??'入力を固定できませんでした。');
   await assertValidationAInput(data,payload);const blob=await validationAZip(data,payload.imageDataUrl);
   fixed=validationACase(data);onFreeze();onChange();render();const link=download(fixed.caseId+'.zip',blob,'application/zip');status.replaceChildren(el('span','入力を固定しました。保存が始まらない場合：'),link);
  }catch(error){status.textContent=error.message;}finally{freeze.disabled=false;}
 });
 release.addEventListener('click',()=>{if(isBusy())return;fixed=null;onRelease();onChange();render();status.textContent='固定を解除しました。評価メモはオフのままです。';});render();
 return {record:()=>fixed?validationACase(fixed):null,restore(value){fixed=validationACase(value);fixed?onFreeze():onRelease();render();},async headers(payload){if(!fixed)return {};await assertValidationAInput(fixed,payload);return {'X-Validation-A-Case':fixed.caseId};}};
}
