export function exportOptions(value){
 const width=Number(value.width??1280),format=value.format??'png',quality=Number(value.quality??.9),maxBytes=Number(value.maxBytes??0);
 if(![1536,1280,960,640].includes(width)||!['png','jpeg'].includes(format)||!Number.isFinite(quality)||quality<.4||quality>1||!Number.isFinite(maxBytes)||maxBytes<0||maxBytes>20*1024*1024)throw new Error('画像の保存設定を確認してください。');
 return {width,height:width*9/16,format,quality,maxBytes,mime:format==='jpeg'?'image/jpeg':'image/png'};
}
export async function encodeImage(dataUrl,options,{document=globalThis.document,load=async url=>{const image=new Image();image.src=url;await image.decode();return image;}}={}){
 const o=exportOptions(options),image=await load(dataUrl),canvas=document.createElement('canvas');canvas.width=o.width;canvas.height=o.height;
 const context=canvas.getContext('2d');if(!context)throw new Error('画像の変換を開始できません。');context.fillStyle='#ffffff';context.fillRect(0,0,o.width,o.height);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,o.width,o.height);
 const encode=quality=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.type===o.mime?resolve(blob):reject(new Error('画像を変換できませんでした。')),o.mime,quality));
 let quality=o.quality,blob=await encode(quality);
 while(o.maxBytes&&blob.size>o.maxBytes&&o.format==='jpeg'&&quality>.4){quality=Math.max(.4,Math.round((quality-.1)*100)/100);blob=await encode(quality);}
 if(o.maxBytes&&blob.size>o.maxBytes)throw new Error('指定した容量に収まりません。JPEGか小さい画像サイズを選んでください。元の完成画像は保持しています。');
 return {blob,width:o.width,height:o.height,format:o.format,quality:o.format==='jpeg'?quality:null};
}
export function createImageSaveControls({root,imageDataUrl,document=globalThis.document,download,encode=encodeImage}={}){
 const el=(tag,text='')=>{const node=document.createElement(tag);node.textContent=text;return node;};
 const details=el('details'),summary=el('summary','サイズ・形式を変えて保存（無料）'),width=el('select'),format=el('select'),quality=el('input'),target=el('select'),button=el('button','保存用の画像を作る'),status=el('p');button.type='button';quality.type='range';quality.min=40;quality.max=100;quality.value=90;
 for(const value of [1280,1536,960,640]){const option=el('option',`${value}×${value*9/16}`);option.value=String(value);width.append(option);}width.value='1280';
 for(const [value,name]of [['png','PNG'],['jpeg','JPEG']]){const option=el('option',name);option.value=value;format.append(option);}format.value='png';
 for(const [value,name]of [[0,'容量指定なし'],[2*1024*1024,'2MiB以下を目標'],[1024*1024,'1MiB以下を目標']]){const option=el('option',name);option.value=String(value);target.append(option);}target.value='0';
 for(const [node,text]of [[width,'保存サイズ'],[format,'保存形式'],[quality,'JPEG品質'],[target,'ファイル容量の目標']]){node.setAttribute('aria-label',text);const label=el('label',text);label.append(node);details.append(label);}
 status.setAttribute('role','status');details.prepend(summary);details.append(button,status,el('p','保存用の変換です。比較に使う元画像は変えません。JPEGの容量調整では画質が変わるため、保存画像も確認してください。'));
 root.append(details);
 button.addEventListener('click',async()=>{if(button.disabled)return;button.disabled=true;status.textContent='保存用の画像を変換しています…';try{const result=await encode(imageDataUrl,{width:width.value,format:format.value,quality:Number(quality.value)/100,maxBytes:target.value},{document});const link=download(`thumbnail-${result.width}x${result.height}.${result.format==='jpeg'?'jpg':'png'}`,result.blob,result.blob.type);status.textContent=`${result.width}×${result.height}・${result.format.toUpperCase()}・${(result.blob.size/1024/1024).toFixed(2)}MiBを作成しました。`;if(link&&typeof link.click==='function'){link.textContent='この画像を保存';status.append(link);}}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
 return {button,status};
}
