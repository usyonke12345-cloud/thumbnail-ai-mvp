import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,composeCandidates} from '../backend/generation/index.mjs';
import {makeTextLayout,aiTitleFontSize} from '../backend/generation/layout-metadata.mjs';
import {readFile} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
test('C3 fixtures contain a valid synthetic PNG, image backdrop, stroke and partial unknown fit',async()=>{
 const fixture=JSON.parse(await readFile(new URL('../docs/fixtures/generation-metadata.json',import.meta.url),'utf8'));
 for(const caseId of ['c3','c3-emoji']){
  const set=fixture.sets.find(s=>s.caseId===caseId);assert.equal(set.source,'synthetic');assert.equal(set.candidates.length,3);
  for(const c of set.candidates){
   const titles=c.metadata.textLayout.elements.filter(e=>e.role==='title');assert.equal(titles.map(e=>e.text).join(''),set.input.title);
   assert.ok(titles.every(e=>e.textBackdrop.kind==='image'&&e.stroke.width===4));
   if(caseId==='c3-emoji'){assert.ok(titles.some(e=>e.measurement==='unknown'&&e.width===null));assert.ok(titles.some(e=>e.measurement==='estimated'));}
   else assert.ok(titles.every(e=>e.measurement==='estimated'));
   const svg=Buffer.from(c.imageDataUrl.split(',')[1],'base64').toString();const png=Buffer.from(svg.match(/<image href="data:image\/png;base64,([^"]+)"/)[1],'base64');
   assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1280);assert.equal(png.readUInt32BE(20),720);
   const data=[];for(let offset=8;offset<png.length;){const size=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='IDAT')data.push(png.subarray(offset+8,offset+8+size));offset+=size+12;}assert.equal(inflateSync(Buffer.concat(data)).length,720*(1280*3+1));
  }
 }
});
test('Unicode title, role and positions match generated SVG',async()=>{
 const title='🎬動'.repeat(30);
 for(const c of await generate({title,genre:'other'})){
 const m=c.metadata,els=m.textLayout.elements,lines=els.filter(e=>e.role==='title');
 assert.equal(m.textLength,60);assert.equal(lines.map(e=>e.text).join(''),title);assert.equal(lines.length,4);assert.equal(m.generation_version,'0.4.0');
 const svg=Buffer.from(c.imageDataUrl.split(',')[1],'base64').toString();
 for(const e of lines){assert.ok(svg.includes(`x="${e.x}" y="${e.baselineY}" font-size="${e.fontSize}"`));assert.equal(e.measurement,'unknown');assert.equal(e.width,null);assert.equal(e.resolvedFontFamily,null);}
 assert.equal(els.at(-1).role,'footer');
 }
});
test('fixed Japanese outlines and C3 preserve titles and fit short/60-character inputs',()=>{
 for(const title of ['動','初心者のための動画制作','動'.repeat(60),'AI & <動画> 123'])for(const background of [null,'data:image/png;base64,AA=='])for(const c of composeCandidates({title,genre:'other'},background)){
  const els=c.metadata.textLayout.elements.filter(e=>e.role==='title');assert.equal(els.map(e=>e.text).join(''),title);
  for(const e of els){const r=e.textRegion,p=r.padding;assert.equal(e.resolvedFontFamily,'Noto Sans CJK JP');assert.ok(e.x>=r.x+p.left);assert.ok(e.topY>=r.y+p.top);assert.ok(e.x+e.width<=r.x+r.width-p.right);assert.ok(e.topY+e.height<=r.y+r.height-p.bottom);if(background)assert.equal(e.textBackdrop.kind,'image');}
  const svg=Buffer.from(c.imageDataUrl.split(',')[1],'base64').toString();assert.ok(svg.includes('<path'));assert.ok(!svg.includes('<text'));if(background)assert.ok(svg.includes('linearGradient'));
 }
});
test('AI backdrop is solid only for contained title; overflow retains panel',()=>{
 const a=makeTextLayout(['動画'],48,'#ffffff','#172554',true,'footer');
 assert.equal(a.elements[0].textBackdrop.kind,'solid');assert.equal(a.elements[1].textBackdrop.kind,'unknown');
 const b=makeTextLayout(['動'.repeat(60)],76,'#ffffff','#172554',true,'footer').elements[0];
 assert.equal(b.textBackdrop.kind,'unknown');assert.equal(b.textBackdrop.color,null);assert.equal(b.textRegion.width,800);
});

test('larger AI title remains bounded for long lines',()=>{assert.equal(aiTitleFontSize(['初心者のための動画制作']),64);assert.ok(aiTitleFontSize(['動'.repeat(15)])*15<=736);});


test('footer estimated ink fits its declared padding',()=>{for(const ai of [false,true]){const e=makeTextLayout(['動画'],64,'#ffffff','#172554',ai,'footer').elements.at(-1);const r=e.textRegion,p=r.padding;assert.ok(e.topY>=r.y+p.top);assert.ok(e.topY+e.height<=r.y+r.height-p.bottom);assert.ok(e.x>=r.x+p.left);assert.ok(e.x+e.width<=r.x+r.width-p.right);}});

