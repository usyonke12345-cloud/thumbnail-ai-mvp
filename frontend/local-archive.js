export const ARCHIVE_LIMIT=70*1024*1024;
export const utf8=value=>new TextEncoder().encode(value);
export const decodeText=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes);
export const hashBytes=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function fromDataUrl(url){const binary=atob(url.slice(url.indexOf(',')+1)),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
export function toDataUrl(bytes,mime='image/png'){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return `data:${mime};base64,${btoa(binary)}`;}
const table=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const byte of bytes)c=table[(c^byte)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function writeZip(entries){
 const parts=[],central=[],names=new Set();let offset=0,centralBytes=0;
 for(const {name,data}of entries){
  if(names.has(name)||!safePath(name))throw new Error('ZIPのファイル名が不正です。');names.add(name);
  const filename=utf8(name),crc=crc32(data),local=new Uint8Array(30+filename.length),v=new DataView(local.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);local.set(filename,30);
  const header=new Uint8Array(46+filename.length),h=new DataView(header.buffer);h.setUint32(0,0x02014b50,true);h.setUint16(4,20,true);h.setUint16(6,20,true);h.setUint16(8,0x800,true);h.setUint16(14,33,true);h.setUint32(16,crc,true);h.setUint32(20,data.length,true);h.setUint32(24,data.length,true);h.setUint16(28,filename.length,true);h.setUint32(42,offset,true);header.set(filename,46);
  parts.push(local,data);central.push(header);offset+=local.length+data.length;centralBytes+=header.length;await tick();
 }
 if(offset+centralBytes+22>ARCHIVE_LIMIT)throw new Error('ZIPは70MiB以内にしてください。案件や組を分けて保存してください。');
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralBytes,true);e.setUint32(16,offset,true);
 return new Blob([...parts,...central,end],{type:'application/zip'});
}
function safePath(name){return typeof name==='string'&&name.length<240&&!name.includes('\\')&&!name.includes(':')&&!name.startsWith('/')&&name.split('/').every(x=>x&&x!=='.'&&x!=='..'&&/^[a-zA-Z0-9_. ()-]+$/.test(x));}
async function inflateBounded(bytes,limit){
 let stream;try{stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw new Error('このブラウザでは圧縮ZIPを展開できません。最新版のChrome/Edgeか、サイトで作ったZIPを使ってください。');}
 const reader=stream.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('ZIPの展開容量が宣言を超えています。');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
export async function readZip(bytes,{inflate=inflateBounded}={}){
 if(!(bytes instanceof Uint8Array)||bytes.length>ARCHIVE_LIMIT||bytes.length<22)throw new Error('ZIPは70MiB以内にしてください。');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),need=(offset,size)=>{if(offset<0||size<0||offset+size>bytes.length)throw new Error('ZIPが途中で切れています。');};
 let end=-1;for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(view.getUint32(p,true)===0x06054b50&&p+22+view.getUint16(p+20,true)===bytes.length){end=p;break;}
 if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==view.getUint16(end+10,true))throw new Error('分割ZIPには対応していません。');
 const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true),centralSize=view.getUint32(end+12,true);
 if(!count||count>256||start+centralSize!==end)throw new Error('ZIPの件数・ディレクトリが不正です。');
 let cursor=start,expanded=0;const files=new Map(),names=new Set(),ranges=[];
 for(let i=0;i<count;i++){
  need(cursor,46);if(view.getUint32(cursor,true)!==0x02014b50)throw new Error('ZIPのディレクトリが不正です。');
  const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),crc=view.getUint32(cursor+16,true),compressed=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true),nameSize=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),offset=view.getUint32(cursor+42,true);
  need(cursor+46,nameSize+extra+comment);const name=decodeText(bytes.subarray(cursor+46,cursor+46+nameSize)),folder=name.endsWith('/');
  if(!safePath(folder?name.slice(0,-1):name)||names.has(name)||flags&1||![0,8].includes(method)||view.getUint16(cursor+34,true))throw new Error('ZIPのパス・圧縮形式が不正です。');names.add(name);
  expanded+=size;if(size>ARCHIVE_LIMIT||expanded>192*1024*1024)throw new Error('ZIPの展開容量が大きすぎます。');
  need(offset,30);if(view.getUint32(offset,true)!==0x04034b50||view.getUint16(offset+6,true)!==flags||view.getUint16(offset+8,true)!==method)throw new Error('ZIPのヘッダーが一致しません。');
  const localNameSize=view.getUint16(offset+26,true),localExtra=view.getUint16(offset+28,true);need(offset+30,localNameSize+localExtra);
  if(decodeText(bytes.subarray(offset+30,offset+30+localNameSize))!==name)throw new Error('ZIPのファイル名が一致しません。');
  const dataStart=offset+30+localNameSize+localExtra,dataEnd=dataStart+compressed;if(dataEnd>start||ranges.some(([a,b])=>offset<b&&dataEnd>a))throw new Error('ZIPの画像領域が重複しています。');ranges.push([offset,dataEnd]);need(dataStart,compressed);
  const packed=bytes.subarray(dataStart,dataEnd),data=method===0?packed:await inflate(packed,size);
  if(data.length!==size||crc32(data)!==crc)throw new Error('ZIP内のファイルが破損しています。');
  if(!folder)files.set(name,data);cursor+=46+nameSize+extra+comment;await tick();
 }
 if(cursor!==end)throw new Error('ZIPのディレクトリ長が不正です。');return files;
}
export async function comparisonFromZip(bytes){
 const files=await readZip(bytes),manifests=[...files.keys()].filter(x=>x==='transfer-manifest.json'||x.endsWith('/transfer-manifest.json'));
 if(manifests.length!==1)throw new Error('このアプリの共有ZIPを選んでください。');
 const manifestPath=manifests[0],prefix=manifestPath.slice(0,-'transfer-manifest.json'.length),manifestBytes=files.get(manifestPath);if(manifestBytes.length>1024*1024)throw new Error('ZIPのmanifestが大きすぎます。');
 const m=JSON.parse(decodeText(manifestBytes));if(m.version!=='private-comparison-transfer-1.0.0'||m.compactReport?.filename!=='report-with-asset-references.json'||!Array.isArray(m.assets)||m.assets.length>120)throw new Error('共有ZIPの版が不正です。');
 const compact=files.get(prefix+m.compactReport.filename);if(!compact||compact.length!==m.compactReport.bytes||await hashBytes(compact)!==m.compactReport.sha256)throw new Error('ZIP内の比較記録のSHA-256が一致しません。');
 let restored=decodeText(compact);const used=new Set();
 for(const a of m.assets){
  if(!/^[a-f0-9]{64}$/.test(a.sha256)||a.path!==`assets/${a.sha256}.png`||a.token!==`private-png-sha256:${a.sha256}`||used.has(a.sha256)||!Number.isInteger(a.occurrences)||a.occurrences<1)throw new Error('ZIP内の画像参照が不正です。');used.add(a.sha256);
  const data=files.get(prefix+a.path);if(!data||data.length!==a.bytes||await hashBytes(data)!==a.sha256)throw new Error('ZIP内のPNGのSHA-256が一致しません。');
  if(restored.split(a.token).length-1!==a.occurrences)throw new Error('ZIP内の画像参照件数が一致しません。');restored=restored.split(a.token).join(toDataUrl(data));if(restored.length>ARCHIVE_LIMIT)throw new Error('復元する比較JSONは70MiB以内にしてください。');await tick();
 }
 const original=utf8(restored);if(original.length!==m.sourceReport?.bytes||await hashBytes(original)!==m.sourceReport.sha256)throw new Error('復元した比較JSONのSHA-256が一致しません。');return JSON.parse(restored);
}
export async function readComparisonFile(file){
 if(!Number.isFinite(file.size)||file.size>ARCHIVE_LIMIT)throw new Error('比較JSON・ZIPは70MiB以下にしてください。');
 const header=new Uint8Array(await file.slice(0,4).arrayBuffer());if(header[0]===80&&header[1]===75)return comparisonFromZip(new Uint8Array(await file.arrayBuffer()));
 try{return JSON.parse(await file.text());}catch{throw new Error('JSONを読み取れませんでした。このアプリで保存した比較JSON・ZIPを選んでください。');}
}
