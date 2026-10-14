import {outline,FONT_FAMILY} from './font.mjs';
const background='#10151e',foreground='#ffffff';
const region={x:300,y:170,width:680,height:370,padding:{top:16,right:16,bottom:16,left:16}};
const person=(x,y,size,color)=>`<g transform="translate(${x} ${y}) scale(${size})" fill="${color}"><circle cy="-48" r="17"/><path d="M-22-22Q0-34 22-22L32 32H17L13 94H-1L-5 38H-11L-15 94H-29L-25 30H-38Z"/></g>`;
// A standalone synthetic study, deliberately outside the production API.
export function composeD3Prototype(title){
 if(typeof title!=='string'||!title.trim()||[...title.trim()].length>60||/[\p{Cc}]/u.test(title))throw new Error('タイトルは改行なしの1〜60文字で入力してください。');
 title=title.trim();
 const chars=[...new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(title)].map(p=>p.segment);
 let layout;
 for(let size=86;size>=28;size-=2){
  const count=Math.max(1,Math.ceil(chars.length/Math.max(1,Math.floor(620/size))));
  const length=Math.ceil(chars.length/count);
  const lines=Array.from({length:count},(_,i)=>chars.slice(i*length,(i+1)*length).join(''));
  const measured=lines.map((text,i)=>({text,baseline:i*(size+14),bounds:outline(text,size,0,i*(size+14),foreground).bounds}));
  const top=Math.min(...measured.map(m=>m.bounds?.topY??m.baseline-size));
  const bottom=Math.max(...measured.map(m=>m.bounds?m.bounds.topY+m.bounds.height:m.baseline+size*.2));
  if(bottom-top<=338&&measured.every(m=>(m.bounds?.width??[...m.text].length*size)<=648)){layout={size,measured,shift:355-(top+bottom)/2};break;}
 }
 if(!layout)throw new Error('文字を配置できませんでした。タイトルを短くしてください。');
 const elements=[],paths=layout.measured.map((line,i)=>{
  const x=line.bounds?640-line.bounds.width/2-line.bounds.x:640-[...line.text].length*layout.size/2;
  const baselineY=line.baseline+layout.shift,glyph=outline(line.text,layout.size,x,baselineY,foreground);
  elements.push({id:`title-${i}`,role:'title',lineIndex:i,text:line.text,baselineY,fontSize:layout.size,fontFamily:FONT_FAMILY,fontWeight:700,resolvedFontFamily:glyph.bounds?FONT_FAMILY:null,foreground,measurement:glyph.bounds?'estimated':'unknown',measurementVersion:glyph.bounds?'glyph-outline-1.0.0':null,...(glyph.bounds??{x,topY:null,width:null,height:null}),textRegion:region,textBackdrop:{kind:'solid',color:background}});
  return glyph.svg;
 }).join('');
 const illustration=[-70,-25,20,65].map((dx,i)=>person(155+dx,450+(i%2)*8,1.05,'#b9c2d0')).join('')+person(1115,430,1.7,'#ff3858');
 return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${background}"/>${paths}${illustration}<path d="M60 635H1220" stroke="#526177" stroke-width="6"/></svg>`,metadata:{generation_version:'d3-prototype-0.1.0',source:'synthetic',textLength:[...title].length,fontSize:layout.size,foreground,background,textLayout:{version:'1.0.0',coordinateSpace:'canvas_px',elements}},limitations:['人工イラストの無料試作。タイトルに合うイラストの生成は未実装。','未対応文字のある行は収まり未評価。フォント代替による表示差があり得ます。']};
}
