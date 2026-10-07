// Artificial background and titles only. No environment file, network or paid provider.
import {deflateSync} from 'node:zlib';
import {writeFile} from 'node:fs/promises';
import {composeCandidates} from '../backend/generation/index.mjs';
import {GENERATION_VERSION} from '../backend/generation/layout-metadata.mjs';
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,crc]);}
const width=1280,height=720,rows=Buffer.alloc(height*(1+width*3));
for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*(1+width*3)+1+x*3;rows[p]=24+Math.floor(x/width*60);rows[p+1]=55+Math.floor(y/height*50);rows[p+2]=120;}
const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
const background=`data:image/png;base64,${png.toString('base64')}`;
const cases=[
 ['demo-short','初心者のための動画制作','education',false],
 ['demo-long','動画'.repeat(30),'other',false],
 ['demo-emoji','AIと動画🎬の入門','other',false],
 ['c3','初心者でも動画は作れる','education',true],
 ['c3-emoji','初心者でも🎬動画は作れる','education',true],
];
const sets=cases.map(([caseId,title,genre,c3])=>({caseId,source:'synthetic',mode:c3?'synthetic_background':'demo',input:{title,genre},candidates:composeCandidates({title,genre},c3?background:null).map(c=>({...c,id:`${caseId}-${c.style}`}))}));
await writeFile(new URL('../docs/fixtures/generation-metadata.json',import.meta.url),JSON.stringify({source:'synthetic',generation_version:GENERATION_VERSION,backgroundDescription:'Locally encoded artificial RGB gradient, not an AI-generated or third-party image.',sets},null,2)+'\n');
