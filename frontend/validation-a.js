import {writeZip,utf8,hashBytes,fromDataUrl} from './local-archive.js';
import {normalizeReferenceContext} from '../shared/thumbnail-references.mjs';
import {normalizeVisualIntent,normalizeVideoBrief} from '../shared/complete-designs.mjs';
import {validationAProtocol} from '../shared/validation-a-baseline.mjs';
import {sourcePhotoInputs,additionalPhotoInputs,sourcePhotoHashes} from '../shared/multi-photo.mjs';
import {validationAReceipt} from '../shared/complete-images.mjs';

export function validationACase(value){
 if(value==null)return null;
 if(!['validation-a-case-1.0.0','validation-a-case-1.1.0','validation-a-case-1.2.0'].includes(value.version)||!/^validation-a-[a-f0-9]{64}$/.test(value.caseId)||!Number.isFinite(Date.parse(value.createdAt))||value.hypothesis!=='A'||!value.input||!value.source||!value.service||value.service.feedbackUsed!==false||value.service.revisionUsed!==false||typeof value.servicePrompt!=='string'||value.servicePrompt.length>30000||typeof value.chatgptPrompt!=='string'||value.chatgptPrompt.length>5000||value.source.path!=='source.png'||value.source.width!==1280||value.source.height!==720||![value.requestSha256,value.source.sha256,value.service.sourceSha256,value.servicePromptSha256].every(x=>/^[a-f0-9]{64}$/.test(x)))throw new Error('A検証の固定記録が不正です。固定し直してください。');
 const pick=(object,keys)=>Object.fromEntries(keys.map(key=>[key,object[key]])),input=pick(value.input,['title','brief','visualIntent','headlineMode','headline','design','composition']);
 if(value.input.referenceMode!==undefined){if(!['auto','off','required'].includes(value.input.referenceMode))throw new Error('A検証の参考資料指定が不正です。');input.referenceMode=value.input.referenceMode;}
 if(typeof input.title!=='string'||!input.title.trim()||[...input.title].length>120||!['auto','manual'].includes(input.headlineMode)||!['auto','photo_focus','editorial','impact','recompose'].includes(input.design)||!['auto','text_left','text_right','text_top'].includes(input.composition)||input.headlineMode==='auto'&&input.headline!==null||input.headlineMode==='manual'&&(typeof input.headline!=='string'||!input.headline.trim()||[...input.headline].length>80)||!Number.isInteger(value.source.bytes)||value.source.bytes<24||value.source.bytes>2359296)throw new Error('A検証の固定入力が不正です。');
 normalizeVideoBrief(input.brief);normalizeVisualIntent(input.visualIntent);
 const service=pick(value.service,['generationVersion','model','n','size','quality','output_format','endpoint','feedbackUsed','revisionUsed','files','sourceSha256','nodeVersion']);
 if(!Array.isArray(value.service.files)||value.service.files.length>64||value.service.files.some(f=>!f||typeof f.path!=='string'||f.path.length>200||!/^[a-zA-Z0-9_./-]+$/.test(f.path)||f.path.startsWith('/')||f.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(f.sha256))||['generationVersion','model','nodeVersion'].some(k=>typeof service[k]!=='string'||service[k].length>100)||service.n!==1||service.size!=='1536x864'||service.quality!=='medium'||service.output_format!=='png'||service.endpoint!=='images/edits')throw new Error('A検証の生成設定が不正です。');
 service.files=value.service.files.map(f=>pick(f,['path','sha256']));
 if(value.service.referenceContext!==undefined){if(!['auto','required'].includes(input.referenceMode))throw new Error('A検証の参考資料指定が一致しません。');service.referenceContext=normalizeReferenceContext(value.service.referenceContext);}
 if(['auto','required'].includes(input.referenceMode)&&!service.referenceContext)throw new Error('A検証の参考資料記録がありません。');
 const referenceAssets=referenceAssetRecords(value.referenceAssets,service.referenceContext);
 const additionalSources=additionalSourceRecords(value.additionalSources,value.source.sha256);
 if(value.version!==(additionalSources.length===3?'validation-a-case-1.2.0':additionalSources.length?'validation-a-case-1.1.0':'validation-a-case-1.0.0'))throw new Error('複数写真の固定形式と写真件数が一致しません。');
 // Whitelist nested properties too: draft transfers never retain credentials.
 return {version:value.version,caseId:value.caseId,createdAt:value.createdAt,hypothesis:'A',input,source:pick(value.source,['path','sha256','bytes','width','height']),...(additionalSources.length?{additionalSources}:{}),requestSha256:value.requestSha256,service,servicePromptSha256:value.servicePromptSha256,servicePrompt:value.servicePrompt,chatgptPrompt:value.chatgptPrompt,...(referenceAssets.length?{referenceAssets}:{})};
}
function additionalSourceRecords(value,primaryHash){
 if(value===undefined)return [];if(!Array.isArray(value)||!value.length||value.length>3)throw new Error('追加写真の固定記録が不正です。');
 sourcePhotoHashes([primaryHash,...value.map(x=>x?.sha256)]);return value.map((x,i)=>{if(x.path!==`source-${i+2}.png`||x.width!==1280||x.height!==720||!Number.isInteger(x.bytes)||x.bytes<24||x.bytes>2359296)throw new Error('追加写真の固定寸法・上限が不正です。');return {path:x.path,sha256:x.sha256,bytes:x.bytes,width:x.width,height:x.height};});
}
function referenceAssetRecords(value,context){
 const sent=context?.candidates.filter(x=>x.imageSent).map(x=>x.thumbnailSha256)??[],assets=value??[];
 if(!Array.isArray(assets)||assets.length>5||assets.length!==sent.length||new Set(assets.map(x=>x.sha256)).size!==assets.length)throw new Error('A検証の参考画像件数が一致しません。');
 return assets.map(a=>{const extension=a.mimeType==='image/png'?'png':a.mimeType==='image/jpeg'?'jpg':null;if(!extension||!sent.includes(a.sha256)||a.path!==`references/${a.sha256}.${extension}`||!Number.isInteger(a.bytes)||a.bytes<24||a.bytes>2*1024*1024||typeof a.dataUrl!=='string'||a.dataUrl.length>2796228||!new RegExp('^data:'+a.mimeType+';base64,[A-Za-z0-9+/]+={0,2}$').test(a.dataUrl))throw new Error('A検証の参考画像参照が不正です。');return {path:a.path,sha256:a.sha256,mimeType:a.mimeType,bytes:a.bytes,dataUrl:a.dataUrl};});
}
async function requestIdentity(payload){
 const input={title:payload.title,brief:normalizeVideoBrief(payload.brief),visualIntent:normalizeVisualIntent(payload.visualIntent),headlineMode:payload.headlineMode??'manual',headline:(payload.headlineMode??'manual')==='auto'?null:payload.headline,design:payload.design??'auto',composition:payload.composition??'auto',...(payload.referenceMode!==undefined?{referenceMode:payload.referenceMode}:{})};
 const hashes=await Promise.all(sourcePhotoInputs(payload).map(url=>hashBytes(fromDataUrl(url)))),sourceSha256=hashes[0],additionalSourceSha256s=hashes.length>1?sourcePhotoHashes(hashes).slice(1):[];
 return {sourceSha256,additionalSourceSha256s,requestSha256:await hashBytes(utf8(JSON.stringify({input,sourceSha256,...(additionalSourceSha256s.length?{additionalSourceSha256s}:{})})))};
}
export async function assertValidationAInput(value,payload){
 const fixed=validationACase(value);if(!fixed)return;
 if('feedback' in payload||'revision' in payload)throw new Error('A検証では評価メモ・修正元を使えません。');
 if((await requestIdentity(payload)).requestSha256!==fixed.requestSha256)throw new Error('写真・タイトル・イメージ・設定が固定時と変わりました。別ケースとして固定し直してください。');
}
export async function assertValidationAReceiptInput(value,payload){
 const receipt=validationAReceipt(value),identity=await requestIdentity(payload);
 if('feedback' in payload||'revision' in payload||identity.sourceSha256!==receipt.sourceSha256||identity.requestSha256!==receipt.requestSha256||JSON.stringify(identity.additionalSourceSha256s)!==JSON.stringify(receipt.additionalSourceSha256s??[]))throw new Error('A検証の照合結果と、保存する写真・入力条件が一致しません。');
 return receipt;
}
export async function validationAZip(value,imageDataUrl,additionalImageDataUrls){
 const fixed=validationACase(value),photo=fromDataUrl(imageDataUrl);
 const extra=additionalPhotoInputs(additionalImageDataUrls);
 await assertValidationAInput(fixed,{...fixed.input,imageDataUrl,...(extra.length?{additionalImageDataUrls:extra}:{})});
 if(await hashBytes(utf8(JSON.stringify(fixed.service.files)))!==fixed.service.sourceSha256||'validation-a-'+await hashBytes(utf8(JSON.stringify({requestSha256:fixed.requestSha256,service:fixed.service,servicePromptSha256:fixed.servicePromptSha256})))!==fixed.caseId)throw new Error('A検証の固定IDと生成設定が一致しません。');
 if(photo.length!==fixed.source.bytes||await hashBytes(photo)!==fixed.source.sha256||await hashBytes(utf8(fixed.servicePrompt))!==fixed.servicePromptSha256)throw new Error('A検証の写真または指示のハッシュが一致しません。');
 const sourceEntries=[];for(const [i,source]of (fixed.additionalSources??[]).entries()){const data=fromDataUrl(extra[i]);if(data.length!==source.bytes||await hashBytes(data)!==source.sha256)throw new Error('追加写真のハッシュが一致しません。');sourceEntries.push({name:source.path,data});}
 const references=[];for(const asset of fixed.referenceAssets??[]){const data=fromDataUrl(asset.dataUrl);if(data.length!==asset.bytes||await hashBytes(data)!==asset.sha256)throw new Error('A検証の参考画像のハッシュが一致しません。');references.push({name:asset.path,data});}
 const protocol={...validationAProtocol(fixed),caseId:fixed.caseId,chatgptPromptSha256:await hashBytes(utf8(fixed.chatgptPrompt))};
 return writeZip([
  ...references,...sourceEntries,
  {name:'source.png',data:photo},
  {name:'validation-a.json',data:utf8(JSON.stringify(fixed,null,2))},
  {name:'chatgpt-prompt.txt',data:utf8(fixed.chatgptPrompt)},
  {name:'service-prompt.txt',data:utf8(fixed.servicePrompt)},
  {name:'comparison-protocol.json',data:utf8(JSON.stringify(protocol,null,2))},
  {name:'README.txt',data:utf8(protocol.note+'\n\n'+(sourceEntries.length?'source.pngとsource-2.png以降の写真をすべて添付し、chatgpt-prompt.txtの短い依頼文を使ってください。複数写真はPR #11の正式Aとは別に条件を合意してください。':protocol.ordinaryBaselineMatched?'source.pngをChatGPTの新しい会話へ添付し、chatgpt-prompt.txtの短い依頼文をそのまま送ってください。サービス内部の詳細指示を足さないでください。':'旧依頼文は変更せず保持しています。正式Aを新しく始める場合は条件を合意して別ケースとして固定してください。')+'\nservice-prompt.txtは実行条件の監査用です。通常のA比較でChatGPTに送る文ではありません。'+(!protocol.pr11TitleLengthCompatible?'\nこのタイトルはPR #11の60文字上限を超えます。正式な比較条件を先に合意し、元のタイトルを勝手に短くしないでください。':'')+'\n\nサービスは評価メモなし・修正なし。双方の最初の1枚を保存し、失敗も残します。固定保存では画像生成・比較・許諾確認は行いません。モデル設定と実行コードのSHA-256はvalidation-a.jsonにあります。同一画像の再現を保証するものではありません。写真と入力内容を含むため非公開で扱ってください。完成画像・人の評価・実費は別に記録します。このZIPは入力の照合用で、サイトへの復元用ではありません。下書きの移行には既存の下書きZIPを併せて保存してください。')}
 ]);
}
export function createValidationA({root,capture,download,onChange=()=>{},onFreeze=()=>{},onRelease=()=>{},isBusy=()=>false,document=globalThis.document,fetchImpl=(...args)=>fetch(...args)}){
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;},freeze=el('button','A検証の入力を固定してZIP保存（無料）'),release=el('button','固定を解除'),status=el('p'),summary=el('pre');
 freeze.type=release.type='button';summary.style.whiteSpace='pre-wrap';status.setAttribute('role','status');
 root.replaceChildren(el('h3','A検証：最初の1枚を比べる'),el('p','サービスと、ChatGPTへ普通に短く頼んだ最初の1枚を比べます。同じ写真・タイトル・補足・イメージ・見出し方針を固定します。ChatGPTへサービス内部の詳細指示は渡しません。固定中は評価メモを使わず、固定保存では有料APIを呼びません。'),freeze,release,summary,status);
 let fixed=null;
 function render(){release.disabled=!fixed;const protocol=fixed?validationAProtocol(fixed):null;summary.textContent=fixed?`${protocol.note}${!protocol.pr11TitleLengthCompatible?'\nPR #11のタイトル60文字上限を超えています。正式な条件を確認してください。':''}\n固定ID：${fixed.caseId}\n動画タイトル：${fixed.input.title}\n補足：${fixed.input.brief||'なし'}\nイメージ：${fixed.input.visualIntent||'指定なし'}\n見出し：${fixed.input.headlineMode==='auto'?'AIに任せる':fixed.input.headline}\nサービスのデザイン：${fixed.input.design} / 構図：${fixed.input.composition}\n${fixed.service.generationVersion} / ${fixed.service.model} / ${fixed.service.quality} / ${fixed.service.size}\n評価メモ：オフ / 固定後の写真・条件変更は生成前に停止します。`:'まだ入力を固定していません。写真と動画タイトルを用意してください。';}
 freeze.addEventListener('click',async()=>{
  if(isBusy())return;freeze.disabled=true;
  try{const payload=await capture();if(payload.revision)throw new Error('最初の1枚の検証です。「修正をやめる」で通常生成へ戻してください。');const {consent,...input}=payload;
   const response=await fetchImpl('/api/v1/validation-a/freeze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),data=await response.json();if(!response.ok)throw new Error(data.error?.message??'入力を固定できませんでした。');
   await assertValidationAInput(data,payload);const blob=await validationAZip(data,payload.imageDataUrl,payload.additionalImageDataUrls);
   fixed=validationACase(data);onFreeze();onChange();render();const link=download(fixed.caseId+'.zip',blob,'application/zip');status.replaceChildren(el('span','入力を固定しました。保存が始まらない場合：'),link);
  }catch(error){status.textContent=error.message;}finally{freeze.disabled=false;}
 });
 release.addEventListener('click',()=>{if(isBusy())return;fixed=null;onRelease();onChange();render();status.textContent='固定を解除しました。評価メモはオフのままです。';});render();
 return {record:()=>fixed?validationACase(fixed):null,restore(value){fixed=validationACase(value);fixed?onFreeze():onRelease();render();},async headers(payload){if(!fixed)return {};await assertValidationAInput(fixed,payload);return {'X-Validation-A-Case':fixed.caseId};}};
}
