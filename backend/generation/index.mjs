import { randomUUID } from 'node:crypto';
import { ApiError } from '../../shared/contracts.mjs';
import { generateBackground } from './openai.mjs';
import { GENERATION_VERSION, makeTextLayout, aiTitleFontSize } from './layout-metadata.mjs';
export function generationMode() {return (process.env.GENERATION_PROVIDER ?? 'mock')==='openai'?'ai_background':'demo';}
const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
/** Contract: generate(input) => Promise<Candidate[]>; provider owns encoding and metadata. */
export async function generate(input) {
  const provider=process.env.GENERATION_PROVIDER ?? 'mock';
  if (!['mock','openai'].includes(provider)) throw new ApiError(503,'PROVIDER_UNAVAILABLE','指定した生成プロバイダーは未実装です。');
  const backgroundImage=provider==='openai'?await generateBackground(input):null;
  const chars=[...input.title];
  const lines=Array.from({length:Math.ceil(chars.length/15)},(_,i)=>chars.slice(i*15,i*15+15).join(''));
  return [['bold','#172554','#facc15'],['clean','#f8fafc','#0f172a'],['contrast','#4c1d95','#ffffff']].map(([style,bg,fg],i)=> {
    const fontSize=backgroundImage?aiTitleFontSize(lines):(style==='clean' ? 64 : 76);
    const text=lines.map((line,j)=>`<text x="80" y="${210+j*100}" font-size="${fontSize}" font-weight="800" fill="${fg}">${escape(line)}</text>`).join('');
    const background=backgroundImage?`<image href="${backgroundImage}" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/><rect x="48" y="120" width="800" height="460" rx="24" fill="${bg}"/>`:'';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720" font-family="sans-serif"><rect width="1280" height="720" fill="${bg}"/>${background}<rect x="80" y="80" width="150" height="12" fill="${fg}"/>${text}<text x="80" y="660" font-size="24" fill="${fg}">${backgroundImage?'AI BACKGROUND':'LAYOUT DEMO'} · ${escape(input.genre)} · ${i+1}</text></svg>`;
    const footer=`${backgroundImage?'AI BACKGROUND':'LAYOUT DEMO'} · ${input.genre} · ${i+1}`;
    return {id:randomUUID(),style,mimeType:'image/svg+xml',imageDataUrl:`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,width:1280,height:720,metadata:{textLength:chars.length,lineCount:lines.length,fontSize,foreground:fg,background:bg,generation_version:GENERATION_VERSION,textLayout:makeTextLayout(lines,fontSize,fg,bg,Boolean(backgroundImage),footer)}};
  });
}
