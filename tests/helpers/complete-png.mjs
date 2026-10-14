import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createEntry,addToGallery,comparisonBundle} from '../../frontend/complete-gallery-model.js';
const table=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function chunk(type,data){const name=Buffer.from(type),body=Buffer.concat([name,data]);let crc=0xffffffff;for(const b of body)crc=table[(crc^b)&255]^(crc>>>8);const size=Buffer.alloc(4),end=Buffer.alloc(4);size.writeUInt32BE(data.length);end.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,body,end]);}
export function png(width=1536,height=864,color=[36,80,120,255],{method=0,transparency=false}={}){
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=transparency?2:6;header[10]=method;
 const channels=transparency?3:4,row=Buffer.alloc(width*channels+1);for(let x=0;x<width;x++)for(let c=0;c<channels;c++)row[x*channels+c+1]=color[c];
 const raw=Buffer.alloc(row.length*height);for(let y=0;y<height;y++)row.copy(raw,y*row.length);
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),...(transparency?[chunk('tRNS',Buffer.alloc(6))]:[]),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
export const dataUrl=bytes=>`data:image/png;base64,${bytes.toString('base64')}`;
export const asset=(bytes,{assetId='complete',role='complete_thumbnail',width=1536,height=864}={})=>({assetId,role,sha256:createHash('sha256').update(bytes).digest('hex'),mimeType:'image/png',width,height,byteLength:bytes.length,dataUrl:dataUrl(bytes)});
export const reference=(assetId='complete',imageId='image-a',sourcePhotoAssetId=null)=>({imageId,assetId,role:'complete_thumbnail',generationVersion:'ai-complete-0.1.2',sourcePhotoAssetId,backgroundAssetId:null,headlineProvided:'TEST VIDEO',renderedTextVerified:false,textRegions:null});
const source=dataUrl(png(1280,720)),outputs=[dataUrl(png()),dataUrl(png(1536,864,[220,160,20,255]))];
export async function bundle({title='Synthetic fixture',sourcePhoto=source,count=2,review=true,context=true,confirmed=false}={}){
 let state={groups:[],images:[],reviews:[]};for(let i=0;i<count;i++)state=addToGallery(state,await createEntry({title,brief:'Artificial input for tests',headline:'TEST VIDEO',composition:i?'text_right':'text_left',imageDataUrl:sourcePhoto},{width:1536,height:864,generation_version:'ai-complete-0.1.2',imageDataUrl:outputs[i],limitations:['Synthetic test only']},{id:`${title.replace(/[^a-zA-Z0-9_-]/g,'_')}-${i}`,capturedAt:'2026-10-10T00:00:00.000Z',elapsedMs:1000+1000*i}));
 if(review)state.reviews.push({version:1,groupId:state.groups[0].id,recordedAt:'2026-10-10T00:01:00.000Z',decision:'none_acceptable',imageId:null,reason:'Artificial record, not a human experiment',issues:['composition'],displayWidths:state.images.map(x=>({imageId:x.id,width:246})),...(context?{context:{version:1,reviewerId:'r01',titleSource:confirmed?'original':'synthetic',titlePermissionConfirmed:confirmed,photoPermissionConfirmed:confirmed}}:{})});
 return comparisonBundle(state,state.groups[0].id);
}
