import { randomUUID } from 'node:crypto';
import { ApiError } from '../../shared/contracts.mjs';
import { generateBackground } from './openai.mjs';
import { GENERATION_VERSION, makeTextLayout } from './layout-metadata.mjs';
import {outline,FONT_FAMILY} from './font.mjs';
export function generationMode() {return (process.env.GENERATION_PROVIDER ?? 'mock')==='openai'?'ai_background':'demo';}
const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
/** Contract: generate(input) => Promise<Candidate[]>; provider owns encoding and metadata. */
export async function generate(input) {
  const provider=process.env.GENERATION_PROVIDER ?? 'mock';
  if (!['mock','openai'].includes(provider)) throw new ApiError(503,'PROVIDER_UNAVAILABLE','指定した生成プロバイダーは未実装です。');
  const backgroundImage=provider==='openai'?await generateBackground(input):null;
  return composeCandidates(input,backgroundImage);
}
// Pure composition permits reusing a saved background without another paid call.
export function composeCandidates(input,backgroundImage=null) {
  const chars=[...input.title];
  const lineLength=backgroundImage?Math.ceil(chars.length/Math.ceil(chars.length/10)):15;
  const lines=Array.from({length:Math.ceil(chars.length/lineLength)},(_,i)=>chars.slice(i*lineLength,i*lineLength+lineLength).join(''));
  return [['bold','#172554','#facc15'],['clean','#f8fafc','#0f172a'],['contrast','#4c1d95','#ffffff']].map(([style,bg,fg],i)=> {
    if(backgroundImage && style==='clean')fg='#ffffff';
    const fontSize=backgroundImage?Math.min(98,Math.floor(736/Math.max(...lines.map(l=>[...l].length))),Math.floor(440/lines.length)-12):(style==='clean' ? 64 : 76);
    const footer=`${backgroundImage?'AI BACKGROUND':'LAYOUT DEMO'} · ${input.genre} · ${i+1}`;
    const layout=makeTextLayout(lines,fontSize,fg,bg,Boolean(backgroundImage),footer);
    const stroke=backgroundImage?{color:'#101827',width:4}:null;
    const text=layout.elements.map(e=>{
      if(backgroundImage&&e.role==='title')e.baselineY=360-(lines.length-1)*(fontSize+12)/2+e.lineIndex*(fontSize+12);
      const glyph=outline(e.text,e.fontSize,80,e.baselineY,fg,e.role==='title'?stroke:null);
      e.fontFamily=FONT_FAMILY;e.fontWeight=700;e.resolvedFontFamily=glyph.bounds?FONT_FAMILY:null;
      e.measurement=glyph.bounds?'estimated':'unknown';e.measurementVersion=glyph.bounds?'glyph-outline-1.0.0':null;
      Object.assign(e,glyph.bounds??{x:80,topY:null,width:null,height:null});
      if(backgroundImage){e.textBackdrop={kind:'image',color:null};if(e.role==='title'){e.textRegion={x:48,y:100,width:800,height:500,padding:{top:16,right:16,bottom:16,left:16}};e.stroke=stroke;}}
      return glyph.svg;
    }).join('');
    const background=backgroundImage?`<image href="${backgroundImage}" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/><defs><linearGradient id="shade"><stop offset="0" stop-color="#101827" stop-opacity=".65"/><stop offset=".5" stop-color="#101827" stop-opacity=".35"/><stop offset=".75" stop-color="#101827" stop-opacity="0"/></linearGradient></defs><rect width="1280" height="720" fill="url(#shade)"/>`:'';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><title>${escape(input.title)}</title><desc>${escape(footer)}</desc><rect width="1280" height="720" fill="${bg}"/>${background}${text}</svg>`;
    return {id:randomUUID(),style,mimeType:'image/svg+xml',imageDataUrl:`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,width:1280,height:720,metadata:{textLength:chars.length,lineCount:lines.length,fontSize,foreground:fg,background:bg,generation_version:GENERATION_VERSION,textLayout:layout}};
  });
}
