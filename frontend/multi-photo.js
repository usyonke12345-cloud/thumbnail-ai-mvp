import {additionalPhotoInputs,additionalPhotoDrafts} from '../shared/multi-photo.mjs';
import {toDataUrl} from './local-archive.js';

export async function normalizeAdditionalPhoto(file,{document=globalThis.document,Image=globalThis.Image,URL=globalThis.URL}={}){
 if(!(file instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('PNG・JPEG・WebPの20MiB以内の写真を選んでください。');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>40000000)throw new Error('4000万画素以内の写真を選んでください。');
  if(file.type==='image/png'&&image.naturalWidth===1280&&image.naturalHeight===720&&file.size<=2359296){
   const imageDataUrl=toDataUrl(new Uint8Array(await file.arrayBuffer()));additionalPhotoInputs([imageDataUrl]);return {file,imageDataUrl};
  }
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
  const ctx=canvas.getContext('2d'),scale=Math.min(1280/image.naturalWidth,720/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  ctx.clearRect(0,0,1280,720);ctx.drawImage(image,(1280-width)/2,(720-height)/2,width,height);
  const imageDataUrl=canvas.toDataURL('image/png');additionalPhotoInputs([imageDataUrl]);return {file,imageDataUrl};
 }finally{URL.revokeObjectURL(url);}
}
async function verifyPhoto(url){const image=new Image();image.src=url;await image.decode();if(image.naturalWidth!==1280||image.naturalHeight!==720)throw new Error('追加写真の実寸法が不正です。');}
export function createMultiPhotoInput({root,document=globalThis.document,decode=file=>normalizeAdditionalPhoto(file,{document}),verify=verifyPhoto,isBusy=()=>false,onChange=()=>{}}){
 const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
 const input=el('input'),label=el('label','追加の写真（任意・2枚まで）'),note=el('p','人物・料理・風景など、同じサムネイルに使いたい写真を追加できます。追加写真は全体を素材として渡し、AIが配置を考えます。下の無料編集のプレビューはメイン写真です。'),list=el('div'),status=el('p');
 input.type='file';input.multiple=true;input.accept='image/png,image/jpeg,image/webp';input.setAttribute('aria-label','AI生成に使う追加写真');status.setAttribute('role','status');status.setAttribute('aria-live','polite');label.append(input);root.replaceChildren(label,note,list,status);
 let entries=[],loading=false,locked=false,version=0;
 const blocked=()=>locked||isBusy();
 function render(){
  list.replaceChildren();input.disabled=loading||blocked()||entries.length===2;
  for(const [index,item]of entries.entries()){
   const card=el('article'),image=el('img'),name=el('p',item.file.name||'追加の写真 '+(index+1)),remove=el('button','この写真を外す');
   image.src=item.imageDataUrl;image.alt='追加の写真 '+(index+1);image.style.width='min(100%,240px)';remove.type='button';remove.disabled=loading||blocked();
   remove.addEventListener('click',()=>{if(loading||blocked())return;entries=entries.filter((_,i)=>i!==index);version++;render();status.textContent='追加の写真を外しました。';onChange();});
   card.append(image,name,remove);list.append(card);
  }
 }
 input.addEventListener('change',async()=>{
  if(loading||blocked())return;const selected=Array.from(input.files??[]);if(!selected.length)return;
  const current=++version;loading=true;render();status.textContent='追加の写真を読み込んでいます…';
  try{
   if(entries.length+selected.length>2)throw new Error('追加の写真は2枚までです。先に不要な写真を外してください。');
   const added=[];for(const file of selected)added.push(await decode(file));if(current!==version)return;
   entries=additionalPhotoDrafts([...entries,...added]);status.textContent=`メイン写真と追加${entries.length}枚を使います。`;onChange();
  }catch(error){if(current===version)status.textContent='追加写真を読み込めません：'+error.message+' 前の写真は保持しています。';}
  finally{if(current===version){loading=false;input.value='';render();}}
 });
 render();
 return {
  capture(){if(loading)throw new Error('追加の写真の読み込みが完了してから生成してください。');return entries.map(x=>({file:x.file,imageDataUrl:x.imageDataUrl}));},
  async restore(value){
   const current=++version;loading=true;render();
   try{const next=additionalPhotoDrafts(value);for(const x of next)await verify(x.imageDataUrl);if(current!==version)return;entries=next;status.textContent=entries.length?`追加${entries.length}枚を復元しました。`:'';}
   finally{if(current===version){loading=false;render();}}
  },
  clear(){version++;loading=false;entries=[];render();status.textContent='';},
  setLocked(value){locked=!!value;render();}
 };
}
