export const MAX_ADDITIONAL_PHOTOS=2;
export const MAX_SOURCE_DATA_URL_LENGTH=3*1024*1024;
export function additionalPhotoInputs(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>MAX_ADDITIONAL_PHOTOS)throw new Error('追加の写真は2枚までです。');
 const photos=value.map(url=>{
  if(typeof url!=='string'||url.length>MAX_SOURCE_DATA_URL_LENGTH||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(url)||url.slice(22).length%4)throw new Error('追加の写真は3MiB以内のPNGデータにしてください。');
  const h=Uint8Array.from(atob(url.slice(22,54)),c=>c.charCodeAt(0));
  if(h.length<24||[137,80,78,71,13,10,26,10].some((v,i)=>h[i]!==v)||String.fromCharCode(...h.slice(12,16))!=='IHDR')throw new Error('追加の写真のPNG形式が不正です。');
  const view=new DataView(h.buffer);if(view.getUint32(16)!==1280||view.getUint32(20)!==720)throw new Error('追加の写真は1280×720のPNGにしてください。');
  return url;
 });
 if(new Set(photos).size!==photos.length)throw new Error('同じ写真が重複しています。');
 return photos;
}
export function sourcePhotoInputs(value){
 const extra=additionalPhotoInputs(value.additionalImageDataUrls);
 if(extra.includes(value.imageDataUrl))throw new Error('メインの写真と追加の写真が重複しています。');
 return [value.imageDataUrl,...extra];
}
export function sourcePhotoHashes(value){
 if(!Array.isArray(value)||value.length<2||value.length>3||value.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x))||new Set(value).size!==value.length)throw new Error('複数写真のSHA-256・件数が不正です。');
 return [...value];
}
export function additionalPhotoDrafts(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>MAX_ADDITIONAL_PHOTOS)throw new Error('下書きの追加写真は2枚までです。');
 const urls=additionalPhotoInputs(value.map(x=>x?.imageDataUrl));
 return value.map((x,i)=>{
  if(!x||!(x.file instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(x.file.type)||x.file.size>20*1024*1024)throw new Error('下書きの追加写真はPNG・JPEG・WebPの20MiB以内にしてください。');
  return {file:x.file,imageDataUrl:urls[i]};
 });
}
