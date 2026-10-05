import { randomUUID } from 'node:crypto';
import { ApiError } from '../../shared/contracts.mjs';
const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
/** Contract: generate(input) => Promise<Candidate[]>; provider owns encoding and metadata. */
export async function generate(input) {
  if ((process.env.GENERATION_PROVIDER ?? 'mock') !== 'mock') throw new ApiError(503,'PROVIDER_UNAVAILABLE','指定した生成プロバイダーは未実装です。');
  const chars=[...input.title];
  const lines=Array.from({length:Math.ceil(chars.length/15)},(_,i)=>chars.slice(i*15,i*15+15).join(''));
  return [['bold','#172554','#facc15'],['clean','#f8fafc','#0f172a'],['contrast','#4c1d95','#ffffff']].map(([style,bg,fg],i)=> {
    const fontSize= style==='clean' ? 64 : 76;
    const text=lines.map((line,j)=>`<text x="80" y="${210+j*100}" font-size="${fontSize}" font-weight="800" fill="${fg}">${escape(line)}</text>`).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="${bg}"/><rect x="80" y="80" width="150" height="12" fill="${fg}"/>${text}<text x="80" y="660" font-size="24" fill="${fg}">LAYOUT DEMO · ${escape(input.genre)} · ${i+1}</text></svg>`;
    return {id:randomUUID(),style,mimeType:'image/svg+xml',imageDataUrl:`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,width:1280,height:720,metadata:{textLength:chars.length,lineCount:lines.length,fontSize,foreground:fg,background:bg}};
  });
}
