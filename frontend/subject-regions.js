import {isReviewerId} from '../shared/reviewer-id.mjs';
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>object(value)&&Object.keys(value).every(k=>allowed.includes(k));
const fail=message=>{throw new Error(message);};
export const SUBJECT_REGIONS_VERSION='subject-regions-1.1.0';
export const SUBJECT_EXTENTS={face:'顔',head_shoulders:'頭と肩',upper_body:'上半身'};
export function validateSubjectRect(rect,width,height){
 if(!keys(rect,['x','y','width','height'])||!['x','y','width','height'].every(k=>Number.isInteger(rect[k]))||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.x+rect.width>width||rect.y+rect.height>height)fail('人物範囲は画像の内側にある、1px以上の四角形を指定してください。');
 return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
}
export function validateSubjectRegions(value,group,image){
 if(!group.input||!keys(value,['version','recordedAt','reviewerId','method','coordinateSystem','sourcePhoto','completeThumbnail'])||!['subject-regions-1.0.0',SUBJECT_REGIONS_VERSION].includes(value.version)||typeof value.recordedAt!=='string'||!Number.isFinite(Date.parse(value.recordedAt))||!isReviewerId(value.reviewerId)||value.method!=='manual'||value.coordinateSystem!=='image_pixels')fail('人物範囲の形式・評価者IDを確認してください（r01のような数字のID）。');
 const legacy=value.version==='subject-regions-1.0.0';
 const pair=[['sourcePhoto',group.input.sourceSha256,1280,720],['completeThumbnail',image.imageSha256,1536,864]],normalized={};
 for(const [name,sha256,width,height]of pair){const asset=value[name];if(!keys(asset,legacy?['sha256','width','height','rect']:['sha256','width','height','rect','extent','truncated'])||asset.sha256!==sha256||asset.width!==width||asset.height!==height)fail('人物範囲と画像のハッシュ・寸法が一致しません。');if(!legacy&&(!Object.hasOwn(SUBJECT_EXTENTS,asset.extent)||typeof asset.truncated!=='boolean'||asset.rect===null&&asset.truncated))fail('囲む部位と、画像の端で切れているかを確認してください。');normalized[name]={sha256,width,height,rect:asset.rect===null?null:validateSubjectRect(asset.rect,width,height),...(!legacy?{extent:asset.extent,truncated:asset.truncated}:{})};}
 if((normalized.sourcePhoto.rect===null)!==(normalized.completeThumbnail.rect===null))fail('元写真と完成画像の両方を囲んでください。');
 if(!legacy&&normalized.sourcePhoto.extent!==normalized.completeThumbnail.extent)fail('元写真と完成画像で同じ部位を指定してください。');
 return {version:value.version,recordedAt:value.recordedAt,reviewerId:value.reviewerId,method:'manual',coordinateSystem:'image_pixels',...normalized};
}
export function subjectRegionsRecord(group,image,sourceRect,completeRect,reviewerId,recordedAt=new Date().toISOString(),{extent='head_shoulders',sourceTruncated=false,completeTruncated=false}={}){
 return validateSubjectRegions({version:SUBJECT_REGIONS_VERSION,recordedAt,reviewerId,method:'manual',coordinateSystem:'image_pixels',sourcePhoto:{sha256:group.input?.sourceSha256,width:1280,height:720,rect:sourceRect,extent,truncated:sourceTruncated},completeThumbnail:{sha256:image.imageSha256,width:1536,height:864,rect:completeRect,extent,truncated:completeTruncated}},group,image);
}
export function recordSubjectRegions(state,imageId,value){
 const image=state.images.find(x=>x.id===imageId),group=state.groups.find(x=>x.id===image?.groupId);if(!group||!image)fail('人物範囲を保存する画像がありません。');
 const subjectRegions=validateSubjectRegions(value,group,image);return {...state,images:state.images.map(x=>x.id===imageId?{...x,subjectRegions}:x)};
}
export function rectFromDrag(start,end,width,height,bounds){
 if(![start.x,start.y,end.x,end.y,bounds.left,bounds.top,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)fail('画像の表示範囲を確認できません。');
 const x=p=>Math.min(width,Math.max(0,(p.x-bounds.left)*width/bounds.width)),y=p=>Math.min(height,Math.max(0,(p.y-bounds.top)*height/bounds.height));
 if(x(start)===x(end)||y(start)===y(end))return null;
 const left=Math.floor(Math.min(x(start),x(end))),top=Math.floor(Math.min(y(start),y(end))),right=Math.ceil(Math.max(x(start),x(end))),bottom=Math.ceil(Math.max(y(start),y(end)));
 return right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;
}
const describe=rect=>rect?`x=${rect.x}, y=${rect.y}, 幅=${rect.width}, 高さ=${rect.height}`:'未指定';
export function subjectRegionsText(value){return value.sourcePhoto.rect?`手動の人物範囲（${value.reviewerId}）：${SUBJECT_EXTENTS[value.sourcePhoto.extent]??'部位・欠けは旧記録で未確認'} / 元写真 ${describe(value.sourcePhoto.rect)}${value.sourcePhoto.truncated?'（端で切れ）':''} / 完成画像 ${describe(value.completeThumbnail.rect)}${value.completeThumbnail.truncated?'（端で切れ）':''}`:'人物範囲は解除済みです。';}

// Local annotation only. Opening, selecting, saving and clearing never fetch or generate.
export function createSubjectRegionControls({root,group,image,reviewerId=()=> 'r01',onSave,document=globalThis.document,loadImage=async src=>{const img=new Image();img.src=src;await img.decode();return img;}}){
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;},details=el('details'),summary=el('summary','人物範囲を記録（無料・手動）'),status=el('p');status.setAttribute('role','status');details.append(summary);root.append(details);
 if(!group.input){details.append(el('p','元写真が記録されている組で指定できます。'));return ()=>{};}
 const prior=image.subjectRegions?validateSubjectRegions(image.subjectRegions,group,image):null,panels=[],save=el('button','両方の人物範囲を保存'),clear=el('button','人物範囲を解除');save.type=clear.type='button';save.disabled=true;
 const extent=el('select'),extentLabel=el('label','両方の画像で囲む部位'),oldConfirmed=el('input'),oldLabel=el('label','旧記録の範囲を、選んだ部位と欠けの状態に合わせて確認した');extent.setAttribute('aria-label','人物範囲の部位');for(const [value,label]of Object.entries(SUBJECT_EXTENTS)){const option=el('option',label);option.value=value;extent.append(option);}extent.value=prior?.sourcePhoto.extent??'head_shoulders';extentLabel.append(extent);oldConfirmed.type='checkbox';oldLabel.append(oldConfirmed);oldLabel.hidden=prior?.version!=='subject-regions-1.0.0';details.append(extentLabel,oldLabel,el('p','基本は「頭と肩」。上は髪のいちばん上、下は肩の線（わきの高さ）、左右は両肩の外側。手やピースサインは含めません。端で切れる場合は見えている部分を囲み、画像ごとの「端で切れている」を選んでください。'));
 details.append(el('p','元写真と完成画像で、同じ主役をそれぞれドラッグして囲んでください。座標は数値でも調整できます。囲んだだけでは写真の保持や品質を判定しません。'));
 for(const [name,label,src,width,height]of [['sourcePhoto','元写真の主役',group.sourceImageDataUrl,1280,720],['completeThumbnail','完成画像の同じ主役',image.result.imageDataUrl,1536,864]]){
  const wrap=el('div'),canvas=el('canvas'),fields=el('div'),inputs={},truncated=el('input'),truncatedLabel=el('label',label+'が画像の端で切れている'),panel={name,canvas,width,height,src,rect:prior?.[name].rect??null,img:null,inputs,truncated,drag:null};truncated.type='checkbox';truncated.checked=prior?.[name].truncated??false;truncated.setAttribute('aria-label',name+' truncated');truncatedLabel.append(truncated);canvas.width=width;canvas.height=height;canvas.style.width='min(100%,480px)';canvas.style.height='auto';canvas.style.touchAction='none';canvas.style.cursor='crosshair';canvas.setAttribute('aria-label',label+'を囲む');
  for(const key of ['x','y','width','height']){const input=el('input'),label=el('label',({x:'左',y:'上',width:'幅',height:'高さ'})[key]);input.type='number';input.min=key==='x'||key==='y'?'0':'1';input.max=String(key==='x'||key==='width'?width:height);input.step='1';input.style.width='6em';input.setAttribute('aria-label',name+' '+key);inputs[key]=input;label.append(input);fields.append(label);input.addEventListener('input',()=>{if(disposed||busy)return;try{const rect={};for(const k of Object.keys(inputs)){if(inputs[k].value==='')throw new Error('四つの座標を入力してください。');rect[k]=Number(inputs[k].value);}panel.rect=validateSubjectRect(rect,width,height);draw(panel);status.textContent='範囲はまだ保存していません。';}catch(error){panel.rect=null;draw(panel);status.textContent=error.message;}});}
  const setRect=rect=>{panel.rect=rect;for(const key of Object.keys(inputs))inputs[key].value=rect?String(rect[key]):'';draw(panel);};
  canvas.addEventListener('pointerdown',event=>{if(disposed||busy||!panel.img||event.button!==undefined&&event.button!==0)return;event.preventDefault();panel.drag={start:{x:event.clientX,y:event.clientY},previous:panel.rect,pointerId:event.pointerId};canvas.setPointerCapture?.(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!panel.drag||busy||event.pointerId!==panel.drag.pointerId)return;setRect(rectFromDrag(panel.drag.start,{x:event.clientX,y:event.clientY},width,height,canvas.getBoundingClientRect()));});
  const finish=event=>{if(!panel.drag||event.pointerId!==panel.drag.pointerId)return;const drag=panel.drag;panel.drag=null;if(event.type==='pointercancel'){setRect(drag.previous);return;}const rect=rectFromDrag(drag.start,{x:event.clientX,y:event.clientY},width,height,canvas.getBoundingClientRect());setRect(rect??drag.previous);status.textContent='範囲はまだ保存していません。';};canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',()=>{if(panel.drag){const previous=panel.drag.previous;panel.drag=null;setRect(previous);}});
  wrap.append(el('h4',label),canvas,fields,truncatedLabel);details.append(wrap);panels.push(panel);setRect(panel.rect);
 }
 let disposed=false,busy=false,loading=false,loaded=false;
 function draw(panel){if(!panel.img)return;const context=panel.canvas.getContext('2d');if(!context)throw new Error('このブラウザでは範囲の描画を使えません。');context.clearRect(0,0,panel.width,panel.height);context.drawImage(panel.img,0,0,panel.width,panel.height);if(panel.rect){context.strokeStyle='#00d68f';context.lineWidth=6;context.strokeRect(panel.rect.x,panel.rect.y,panel.rect.width,panel.rect.height);}}
 function lock(value){busy=value;save.disabled=value||!loaded;clear.disabled=value;extent.disabled=oldConfirmed.disabled=value;for(const panel of panels){panel.truncated.disabled=value;for(const input of Object.values(panel.inputs))input.disabled=value;}}
 details.addEventListener('toggle',async()=>{if(!details.open||loaded||loading||disposed)return;loading=true;status.textContent='写真を読み込んでいます…';try{for(const panel of panels){const img=await loadImage(panel.src);if(disposed)return;if(img.naturalWidth!==panel.width||img.naturalHeight!==panel.height)throw new Error('人物範囲の画像寸法が一致しません。');panel.img=img;draw(panel);}loaded=true;save.disabled=false;status.textContent=prior?subjectRegionsText(prior):'両方の画像で同じ主役を囲んでください。';}catch(error){status.textContent='画像を読み込めません：'+error.message;}finally{loading=false;}});
 async function persist(clearing){if(busy||disposed)return;if(!clearing&&(!loaded||panels.some(p=>!p.rect))){status.textContent='元写真と完成画像の両方を囲んでください。';return;}if(!clearing&&prior?.version==='subject-regions-1.0.0'&&!oldConfirmed.checked){status.textContent='旧記録には部位と欠けの情報がありません。両方の範囲を確認してチェックしてください。';return;}lock(true);try{const record=subjectRegionsRecord(group,image,clearing?null:panels[0].rect,clearing?null:panels[1].rect,reviewerId().trim(),new Date().toISOString(),{extent:extent.value,sourceTruncated:!clearing&&panels[0].truncated.checked,completeTruncated:!clearing&&panels[1].truncated.checked});await onSave(record);if(disposed)return;if(clearing)for(const panel of panels){panel.rect=null;panel.truncated.checked=false;for(const input of Object.values(panel.inputs))input.value='';draw(panel);}status.textContent='保存しました。'+subjectRegionsText(record);}catch(error){status.textContent='保存できません：'+error.message;}finally{lock(false);}}
 save.addEventListener('click',()=>persist(false));clear.addEventListener('click',()=>persist(true));details.append(save,clear,status);
 return ()=>{disposed=true;for(const panel of panels){panel.img=null;panel.drag=null;}};
}
