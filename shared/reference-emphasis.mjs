export const EMPHASIS_ROLES=['distinctive_subject','number_or_result','action_or_change','problem_or_surprise','place_or_product','contrast','context'];
export const EMPHASIS_TREATMENTS=['color','size','weight','backdrop','outline'];
const text=(x,max)=>typeof x==='string'&&!!x.trim()&&[...x].length<=max&&!/[\u0000-\u001f\u007f]/u.test(x);
export function normalizeReferenceEmphasis(value){
 if(!value||Array.isArray(value)||Object.keys(value).some(k=>!['version','mode','spans','relationship'].includes(k))||value.version!=='thumbnail-text-emphasis-1.0.0'||!['selective','uniform','no_text','uncertain'].includes(value.mode)||!Array.isArray(value.spans)||value.spans.length>3||!text(value.relationship,300))throw new Error('文字の強調の観察形式を確認してください。');
 if(value.mode==='selective'?!value.spans.length:!!value.spans.length)throw new Error('部分強調のみ、実画像で読めた語句を記録してください。');
 const spans=value.spans.map(x=>{if(!x||Object.keys(x).some(k=>!['text','role','treatments','appearance'].includes(k))||!text(x.text,50)||!EMPHASIS_ROLES.includes(x.role)||!Array.isArray(x.treatments)||!x.treatments.length||x.treatments.length>EMPHASIS_TREATMENTS.length||new Set(x.treatments).size!==x.treatments.length||x.treatments.some(t=>!EMPHASIS_TREATMENTS.includes(t))||!text(x.appearance,100))throw new Error('実画像の強調語句・役割・見た目を確認してください。');return {text:x.text.trim(),role:x.role,treatments:[...x.treatments],appearance:x.appearance.trim()};});
 if(new Set(spans.map(x=>x.text)).size!==spans.length)throw new Error('強調語句が重複しています。');
 return {version:value.version,mode:value.mode,spans,relationship:value.relationship.trim()};
}
