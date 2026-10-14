// The PNG binary and its data URL have different lengths. Keep browser/API limits aligned.
export const MAX_COMPLETE_PNG_BYTES=16*1024*1024;
export const MAX_COMPLETE_PNG_DATA_URL_LENGTH=22+4*Math.ceil(MAX_COMPLETE_PNG_BYTES/3);
export function isCompletePngDataUrl(value){
 if(typeof value!=='string'||value.length>MAX_COMPLETE_PNG_DATA_URL_LENGTH||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
 const encoded=value.slice(22),padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0;
 return encoded.length%4===0&&encoded.length/4*3-padding<=MAX_COMPLETE_PNG_BYTES;
}
export function revisionParent(value){
 if(!value||typeof value.parentImageId!=='string'||!value.parentImageId.trim()||[...value.parentImageId].length>200||/[\u0000-\u001f\u007f]/u.test(value.parentImageId)||typeof value.parentImageSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.parentImageSha256))throw new Error('修正元の画像参照が不正です。');
 return {parentImageId:value.parentImageId,parentImageSha256:value.parentImageSha256};
}
