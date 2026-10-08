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
