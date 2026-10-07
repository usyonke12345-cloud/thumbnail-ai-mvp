import {openSync} from 'fontkit';
import {fileURLToPath} from 'node:url';
const font=openSync(fileURLToPath(new URL('../../assets/fonts/NotoSansCJKjp-Bold.otf',import.meta.url)));
export const FONT_FAMILY='Noto Sans CJK JP';
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function outline(text,size,x,y,color,stroke=null) {
  // Unsupported glyphs remain native text, explicitly unknown in metadata.
  if([...text].some(c=>!font.hasGlyphForCodePoint(c.codePointAt(0))))return {svg:`<text x="${x}" y="${y}" font-size="${size}" font-weight="700" fill="${color}">${escape(text)}</text>`,bounds:null};
  const run=font.layout(text),scale=size/font.unitsPerEm;
  let cursor=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const paths=run.glyphs.map((glyph,i)=>{
    const pos=run.positions[i],gx=x+(cursor+pos.xOffset)*scale,gy=y-pos.yOffset*scale,b=glyph.bbox;
    if(glyph.path.commands.length){minX=Math.min(minX,gx+b.minX*scale);maxX=Math.max(maxX,gx+b.maxX*scale);minY=Math.min(minY,gy-b.maxY*scale);maxY=Math.max(maxY,gy-b.minY*scale);}
    cursor+=pos.xAdvance;
    return `<path vector-effect="non-scaling-stroke" d="${glyph.path.toSVG()}" transform="translate(${gx} ${gy}) scale(${scale} ${-scale})"/>`;
  }).join('');
  const bounds=Number.isFinite(minX)?{x:minX,topY:minY,width:maxX-minX,height:maxY-minY}:{x,topY:y,width:0,height:0};
  return {svg:`<g fill="${color}"${stroke?` stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linejoin="round" paint-order="stroke fill"`:''}>${paths}</g>`,bounds};
}
