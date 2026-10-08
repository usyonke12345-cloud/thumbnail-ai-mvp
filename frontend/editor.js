import {cropPlacement,fitHeadline} from './editor-layout.js';
const canvas=document.querySelector('#preview'),ctx=canvas.getContext('2d'),status=document.querySelector('#editor-status');
const photos=[null,null],versions=[0,0],settings=[{zoom:1,x:.5,y:.5},{zoom:1,x:.5,y:.5}];
const layout=document.querySelector('#layout'),headline=document.querySelector('#headline'),accent=document.querySelector('#accent');
function photo(image,box,setting){if(!image)return;const p=cropPlacement(image.naturalWidth,image.naturalHeight,box,setting.zoom,setting.x,setting.y);ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.width,box.height);ctx.clip();ctx.drawImage(image,p.x,p.y,p.width,p.height);ctx.restore();}
function draw(){
 ctx.fillStyle='#111620';ctx.fillRect(0,0,1280,720);
 const compare=layout.value==='comparison';
 if(compare){photo(photos[0],{x:0,y:0,width:340,height:720},settings[0]);photo(photos[1],{x:940,y:0,width:340,height:720},settings[1]);}
 else photo(photos[1],{x:650,y:0,width:630,height:720},settings[1]);
 const box=compare?{x:370,y:120,width:540,height:480}:{x:55,y:120,width:550,height:480};
 try{
  const fitted=fitHeadline(headline.value,(text,size)=>{ctx.font=`900 ${size}px Arial, sans-serif`;return ctx.measureText(text).width;},box.width,box.height);
  ctx.font=`900 ${fitted.size}px Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.lineWidth=5;ctx.strokeStyle='#0b1018';
  fitted.lines.forEach((text,i)=>{const y=360+(i-(fitted.lines.length-1)/2)*fitted.size*1.18;ctx.fillStyle=i===1?accent.value:'#ffffff';ctx.strokeText(text,box.x+box.width/2,y);ctx.fillText(text,box.x+box.width/2,y);});
  status.textContent=compare?'左右の写真を選んで配置を調整してください。':'右の写真を使います。左の写真は左右比較に戻すと使えます。';
  document.querySelector('#save-editor').disabled=false;
 }catch(error){status.textContent=error.message;document.querySelector('#save-editor').disabled=true;}
}
photos.forEach((_,index)=>{
 const card=document.createElement('article'),label=document.createElement('label'),input=document.createElement('input');label.textContent=index===0?'左の写真':'右の写真';input.type='file';input.accept='image/png,image/jpeg,image/webp';label.append(input);card.append(label);
 input.addEventListener('change',async()=>{
  const version=++versions[index],file=input.files[0];if(!file)return;let url;
  try{if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('PNG・JPEG・WebPの20MB以内の写真を選んでください。');url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();if(version!==versions[index])return;if(image.naturalWidth*image.naturalHeight>40000000)throw new Error('4000万画素以内の写真を選んでください。');photos[index]=image;draw();}
  catch(error){if(version===versions[index])status.textContent=`写真を読み込めません：${error.message} 前の写真は保持しています。`;}
  finally{if(url)URL.revokeObjectURL(url);}
 });
 for(const [key,name,min,max]of [['zoom','拡大',100,200],['x','横の切り取り位置',0,100],['y','縦の切り取り位置',0,100]]){
  const wrap=document.createElement('label'),range=document.createElement('input');wrap.textContent=name;range.type='range';range.min=min;range.max=max;range.value=settings[index][key]*100;range.addEventListener('input',()=>{settings[index][key]=Number(range.value)/100;draw();});wrap.append(range);card.append(wrap);
 }
 document.querySelector('#photos').append(card);
});
for(const input of [layout,headline,accent])input.addEventListener('input',draw);
document.querySelector('#save-editor').addEventListener('click',async event=>{
 const button=event.currentTarget;button.disabled=true;
 try{const handle=typeof window.showSaveFilePicker==='function'?await window.showSaveFilePicker({suggestedName:'photo-thumbnail.png',types:[{description:'PNG',accept:{'image/png':['.png']}}]}):null;
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNGを作れませんでした。')),'image/png'));
 if(handle){const writer=await handle.createWritable();try{await writer.write(blob);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}status.textContent='PNGを保存しました。';}
 else{const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='photo-thumbnail.png';link.textContent='PNGをダウンロード';status.replaceChildren(link);link.click();}}
 catch(error){status.textContent=error.name==='AbortError'?'保存をキャンセルしました。':`保存できません：${error.message}`;}finally{button.disabled=false;}
});
draw();
