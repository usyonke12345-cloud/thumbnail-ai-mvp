import {hashBytes,fromDataUrl} from './local-archive.js';

export async function runThreeVariants({payload,projectName,gallery,history,root,onResult,onStatus,document=globalThis.document,fetchImpl=globalThis.fetch}){
 const ids=[];
 const finished=new Set();
 const started=performance.now();
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),185000);
 const element=(tag,text)=>{const node=document.createElement(tag);node.textContent=text??'';return node;};
 const cards=Array.from({length:3},(_,index)=>{
  const card=element('article');
  card.append(element('h3',`案${String.fromCharCode(65+index)}`),element('p','生成を待っています。'));
  return card;
 });
 const notice=element('p','今回まとめて生成した3案です。');
 notice.id='three-results-status';
 root.replaceChildren(notice,...cards);
 let successes=0,saveErrors=0;
 const errors=[];
 const finish=async(index,status,fields={})=>{
  if(!ids[index]||finished.has(index))return;
  finished.add(index);
  try{await history.finish(ids[index],{status,elapsedMs:Math.round(performance.now()-started),...fields});}
  catch(error){cards[index].append(element('p','試行履歴を保存できませんでした。'+error.message));}
 };
 try{
  for(let index=0;index<3;index++){
   ids.push(await history.start({title:payload.title,projectName:projectName||payload.title,parentImageId:payload.revision?.parentImageId}));
  }
  onStatus('3案を生成しています。3枚分の生成枠を使います。');
  const requestStarted=performance.now();
  const response=await fetchImpl('/api/v1/complete-thumbnail-batch',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal
  });
  const data=await response.json();
  const imageElapsedMs=Math.round(performance.now()-requestStarted);
  if(!response.ok){const error=new Error(data.error?.message??'3案の生成を確認できませんでした。');error.apiError=true;throw error;}
  if(data.mode!=='ai_complete_batch'||!Array.isArray(data.items)||data.items.length!==3||data.items.some((item,index)=>item.index!==index||!!item.result===!!item.error))throw new Error('3案の応答形式を確認できませんでした。');
  for(const [index,item]of data.items.entries()){
   const card=cards[index];
   card.replaceChildren(element('h3',`案${String.fromCharCode(65+index)}・${item.label}`));
   if(item.error){
    errors.push(item.error.message);
    card.append(element('p',item.error.message));
    const status=item.error.code==='PROVIDER_TIMEOUT'?'timeout':item.error.code==='PROVIDER_NETWORK'?'network_error':'api_error';
    await finish(index,status,{error:item.error.message});
    continue;
   }
   const result=item.result,image=element('img'),save=element('a','この完成PNGを保存');
   image.src=result.imageDataUrl;
   image.alt=`今回生成した案${String.fromCharCode(65+index)}`;
   image.style.width='100%';
   save.href=result.imageDataUrl;
   save.download=`ai-complete-${ids[index]}.png`;
   card.append(image,save);
   successes++;
   const metadata={imageElapsedMs,generationVersion:result.generation_version};
   try{
    metadata.imageSha256=await hashBytes(fromDataUrl(result.imageDataUrl));
    onResult(result);
    await gallery.remember({...payload,...item.settings},result,{id:ids[index],elapsedMs:imageElapsedMs,projectName});
    await finish(index,'success',metadata);
    card.append(element('p','比較一覧へ保存しました。'));
   }catch(error){
    saveErrors++;
    card.append(element('p','比較一覧への保存を確認できませんでした。上のリンクからPNGを保存してください。'+error.message));
    await finish(index,'save_error',{...metadata,error:error.message});
   }
  }
  onStatus(`3案中${successes}案の画像を取得しました。比較保存の未確認は${saveErrors}案です。`);
  return {successes,saveErrors,errors};
 }catch(error){
  const message=error.name==='AbortError'?'3案の応答を待つ期限を超えました。生成・課金の状況は未確認です。':error.message;
  for(let index=0;index<3;index++){
   if(finished.has(index))continue;
   cards[index].append(element('p',message));
   await finish(index,error.name==='AbortError'?'timeout':error.apiError?'api_error':'network_error',{error:message});
  }
  throw error;
 }finally{clearTimeout(timer);}
}
