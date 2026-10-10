import {outline,FONT_FAMILY} from './font.mjs';
// Deterministic composition of an existing background; never calls a provider.
export function composePortraitPrototype(background,lines=['FIND YOUR','PERFECT','HAIRSTYLE']){
 if(typeof background!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(background))throw new Error('PNGの背景を指定してください。');
 if(!Array.isArray(lines)||lines.length<1||lines.length>4||lines.some(line=>typeof line!=='string'||!line.trim()||[...line].length>24||/[\p{Cc}]/u.test(line)))throw new Error('見出しは1〜4行、各行1〜24文字で指定してください。');
 const region={x:370,y:130,width:540,height:460,padding:{top:16,right:16,bottom:16,left:16}};
 let layout;
 for(let size=112;size>=16;size-=2){
  const measured=lines.map((text,i)=>({text,baseline:i*(size+14),bounds:outline(text,size,0,i*(size+14),'#ffffff').bounds}));
  if(measured.some(m=>!m.bounds))throw new Error('見出しに同梱フォントで測定できない文字があります。');
  const top=Math.min(...measured.map(m=>m.bounds.topY)),bottom=Math.max(...measured.map(m=>m.bounds.topY+m.bounds.height));
  if(bottom-top<=428&&measured.every(m=>m.bounds.width<=508)){layout={size,measured,shift:360-(top+bottom)/2};break;}
 }
 if(!layout)throw new Error('見出しを短くしてください。');
 const elements=[],text=layout.measured.map((line,i)=>{
  const foreground=i===1?'#ffdc24':'#ffffff',x=640-line.bounds.width/2-line.bounds.x,baselineY=line.baseline+layout.shift;
  const stroke={color:'#080b10',width:3},glyph=outline(line.text,layout.size,x,baselineY,foreground,stroke);
  elements.push({id:`title-${i}`,role:'title',lineIndex:i,text:line.text,...glyph.bounds,baselineY,fontSize:layout.size,fontFamily:FONT_FAMILY,fontWeight:700,resolvedFontFamily:FONT_FAMILY,foreground,measurement:'estimated',measurementVersion:'glyph-outline-1.0.0',textRegion:region,textBackdrop:{kind:'image',color:null},stroke});
  return glyph.svg;
 }).join('');
 return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><image href="${background}" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>${text}</svg>`,metadata:{generation_version:'portrait-prototype-0.1.0',textLength:lines.reduce((n,line)=>n+[...line].length,0),fontSize:layout.size,textLayout:{version:'1.0.0',coordinateSpace:'canvas_px',elements}},limitations:['写真背景上の文字コントラストは未評価。','背景は内蔵画像生成による別途作成資産。本番API経由の生成品質は未検証。']};
}

