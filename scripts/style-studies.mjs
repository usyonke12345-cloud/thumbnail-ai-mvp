// Original synthetic illustrations. No reference images, network or paid API.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {outline} from '../backend/generation/font.mjs';
const output=resolve(process.argv[2]??'../../style-studies');
await mkdir(output,{recursive:true});
const words=['努力だけでは','差がつかない'];
const person=(x,y,size,color)=>`<g transform="translate(${x} ${y}) scale(${size})" fill="${color}"><circle cy="-48" r="17"/><path d="M-22-22Q0-34 22-22L32 32H17L13 94H-1L-5 38H-11L-15 94H-29L-25 30H-38Z"/></g>`;
const group=(x,y,size)=>[-70,-25,20,65].map((dx,i)=>person(x+dx,y+(i%2)*8,size,'#b9c2d0')).join('');
const text=(x,y,size)=>words.map((word,i)=>outline(word,size,x,y+i*(size+14),'#ffffff').svg).join('');
let variants=[
 {id:'contrast-wide',label:'D1：上に文字、下に対比イラスト',body:text(80,120,80)+group(240,450,1.2)+person(1010,420,1.5,'#ff3858')+'<path d="M110 625H1150" stroke="#526177" stroke-width="6"/><path d="M420 500Q650 610 850 455" fill="none" stroke="#526177" stroke-width="8"/>',note:'上段の文字と下段の図を分ける。灰色の集団と赤い1人の対比。'},
 {id:'contrast-split',label:'D2：左に文字、右に対比イラスト',body:text(70,280,80)+group(810,430,.8)+person(1110,395,1.2,'#ff3858')+'<path d="M700 590H1200" stroke="#526177" stroke-width="6"/>',note:'既存C3と同じ左文字の系統。右側の図が小さくなるため縮小時の確認が必要。'},
 {id:'contrast-center',label:'D3：中央に文字、左右にイラスト',body:text(340,310,78)+group(160,445,.75)+person(1100,420,1.35,'#ff3858')+'<path d="M70 600H1210" stroke="#526177" stroke-width="6"/>',note:'左右の図を中央の文字で分ける。文字とイラストが接近しすぎないか確認する。'}
];
if(process.argv.includes('--d3')){
 const centeredText=(size)=>words.map((word,i)=>{
  const measured=outline(word,size,0,0,'#ffffff');
  if(!measured.bounds)throw new Error('Comparison title must have measurable glyphs.');
  const x=640-measured.bounds.width/2-measured.bounds.x;
  return outline(word,size,x,320+i*(size+14),'#ffffff').svg;
 }).join('');
 variants=[
  {id:'d3-a',label:'D3-A：文字86px・図を大きく',size:86,left:1.05,right:1.7,note:'左右の対比を強く見せる。文字は3案の中で小さめ。'},
  {id:'d3-b',label:'D3-B：文字100px・図と文字を均衡',size:100,left:.95,right:1.6,note:'文字を拡大し、左右の図と中央文字の間に余白を残す。'},
  {id:'d3-c',label:'D3-C：文字112px・文字を優先',size:112,left:.8,right:1.35,note:'大きな文字を優先。左右のイラストが縮小時にも伝わるか確認する。'}
 ].map(v=>({...v,body:centeredText(v.size)+group(155,450,v.left)+person(1115,430,v.right,'#ff3858')+'<path d="M60 635H1220" stroke="#526177" stroke-width="6"/>'}));
}
for(const variant of variants){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#10151e"/>${variant.body}</svg>`;await writeFile(resolve(output,`${variant.id}.svg`),svg);}
const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>対比イラスト型の構図比較</title><style>body{background:#151923;color:white;font:18px sans-serif;max-width:1100px;margin:32px auto;padding:20px}img{width:100%;height:auto}article{margin:36px 0}aside{color:#cbd5e1}.small{display:flex;gap:20px;overflow:auto}.small img{height:auto;max-width:none}</style><h1>対比イラスト型：構図の比較</h1><aside>参考5本目の「対比」と配置から作った別の構図案。図形は新規の人工イラストです。API課金なし。画像の学習や元のサムネの再利用はしていません。文字は同一、位置と図の大きさを比較します。未採点・未検証です。縮小幅168/246/360pxは仮の確認条件です。</aside>${variants.map(v=>`<article><h2>${v.label}</h2><img src="${v.id}.svg" alt="${v.label}"><p>${v.note}</p><div class="small">${[168,246,360].map(width=>`<div><p>${width}px</p><img src="${v.id}.svg" style="width:${width}px" alt="${v.label} ${width}px"></div>`).join('')}</div></article>`).join('')}</html>`;
await writeFile(resolve(output,'index.html'),html);
console.log(output);
