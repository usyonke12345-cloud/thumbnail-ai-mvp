export const GENERATION_VERSION = '0.3.0';
const fontFamily = 'sans-serif';
// Ink bounds are estimates, not font metrics or a measured line box.
function widthOf(text, size) {
  return [...text].reduce((sum, ch) => sum + (ch.codePointAt(0) < 128 ? .62 : 1), 0) * size;
}
export function makeTextLayout(lines, fontSize, foreground, background, ai, footer) {
  const panel = ai ? {x:48,y:120,width:800,height:460} : {x:0,y:0,width:1280,height:720};
  const padding = n => ({top:n,right:n,bottom:n,left:n});
  const element = (text, size, baselineY, role, lineIndex) => {
    const box = {x:80,topY:baselineY-size*.88,width:widthOf(text,size),height:size*1.08};
    const inside = box.x >= panel.x+24 && box.topY >= panel.y+24 && box.x+box.width <= panel.x+panel.width-24 && box.topY+box.height <= panel.y+panel.height-24;
    return {id:`${role}-${lineIndex}`,role,lineIndex,text,...box,baselineY,fontSize:size,fontFamily,fontWeight:role==='title'?800:400,resolvedFontFamily:null,foreground,
      measurement:'estimated',measurementVersion:'ink-estimate-1.0.0',
      textRegion:role==='title'?{...panel,padding:padding(ai?16:40)}:{x:0,y:600,width:1280,height:120,padding:padding(40)},
      textBackdrop:{kind:!ai||role==='title'&&inside?'solid':'unknown',color:!ai||role==='title'&&inside?background:null}};
  };
  return {version:'1.0.0',coordinateSpace:'canvas_px',elements:[...lines.map((line,i)=>element(line,fontSize,210+i*100,'title',i)),element(footer,24,660,'footer',0)]};
}
