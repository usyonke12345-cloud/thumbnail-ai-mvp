import {normalizeReferenceContext} from './thumbnail-references.mjs';
import {sourcePhotoHashes} from './multi-photo.mjs';
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
// A receipt records a server-side input check, never an output-quality judgement.
export function validationAReceipt(value){
 const keys=['caseId','requestSha256','sourceSha256','serviceSourceSha256','feedbackUsed','referenceContext','additionalSourceSha256s'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||typeof value.caseId!=='string'||!/^validation-a-[a-f0-9]{64}$/.test(value.caseId)||!['requestSha256','sourceSha256','serviceSourceSha256'].every(k=>typeof value[k]==='string'&&/^[a-f0-9]{64}$/.test(value[k]))||value.feedbackUsed!==false)throw new Error('A検証の照合結果が不正です。');
 const extra=value.additionalSourceSha256s===undefined?[]:Array.isArray(value.additionalSourceSha256s)?sourcePhotoHashes([value.sourceSha256,...value.additionalSourceSha256s]).slice(1):(()=>{throw new Error('A検証の追加写真のSHA-256が不正です。');})();
 return {caseId:value.caseId,requestSha256:value.requestSha256,sourceSha256:value.sourceSha256,serviceSourceSha256:value.serviceSourceSha256,feedbackUsed:false,...(extra.length?{additionalSourceSha256s:extra}:{}),...(value.referenceContext!==undefined?{referenceContext:normalizeReferenceContext(value.referenceContext)}:{})};
}
