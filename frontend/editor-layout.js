export function cropPlacement(width,height,box,zoom=1,x=.5,y=.5){
 if(![width,height,box.width,box.height,zoom,x,y].every(Number.isFinite)||width<=0||height<=0||zoom<1||zoom>2||x<0||x>1||y<0||y>1)throw new Error('配置値が不正です。');
 const scale=Math.max(box.width/width,box.height/height)*zoom,w=width*scale,h=height*scale;
 return {x:box.x-(w-box.width)*x,y:box.y-(h-box.height)*y,width:w,height:h};
}
export function fitHeadline(value,measure,width,height){
 const paragraphs=value.trim().split(/\n/);
 for(let size=100;size>=20;size-=2){
  const lines=[];
  for(const paragraph of paragraphs){let line='';for(const {segment} of new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(paragraph)){if(line&&measure(line+segment,size)>width){lines.push(line.trim());line=segment;}else line+=segment;}if(line.trim())lines.push(line.trim());}
  if(lines.length&&lines.length<=5&&lines.length*size*1.18<=height&&lines.every(line=>measure(line,size)<=width))return {size,lines};
 }
 throw new Error('見出しを短くしてください。');
}
export function suggestPhotoLayouts({data,width,height}){
 if(width<32||height<32||data.length!==width*height*4)throw new Error('写真の解析データが不正です。');
 const luminance=(x,y)=>{const i=(y*width+x)*4;return .2126*data[i]+.7152*data[i+1]+.0722*data[i+2];};
 return [['left',55],['center',365],['right',675]].map(([position,start])=>{
  const x0=Math.floor(start/1280*width),x1=Math.min(width-1,Math.ceil((start+550)/1280*width));
  let sum=0,edges=0,count=0;
  for(let y=Math.floor(height/6);y<Math.floor(height*5/6);y+=2)for(let x=x0;x<x1;x+=2){const l=luminance(x,y);sum+=l;edges+=Math.abs(l-luminance(x+1,y));count++;}
  const brightness=sum/count,detail=edges/count;
  return {position,brightness,detail,shade:Math.round(Math.min(80,Math.max(30,brightness/255*65+detail*1.5))),cost:brightness/255+detail/35};
 }).sort((a,b)=>a.cost-b.cost);
}
