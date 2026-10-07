import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../backend/generation/index.mjs';
import {makeTextLayout,aiTitleFontSize} from '../backend/generation/layout-metadata.mjs';
test('Unicode title, role and positions match generated SVG',async()=>{
 const title='🎬動'.repeat(30);
 for(const c of await generate({title,genre:'other'})){
 const m=c.metadata,els=m.textLayout.elements,lines=els.filter(e=>e.role==='title');
 assert.equal(m.textLength,60);assert.equal(lines.map(e=>e.text).join(''),title);assert.equal(lines.length,4);assert.equal(m.generation_version,'0.3.1');
 const svg=Buffer.from(c.imageDataUrl.split(',')[1],'base64').toString();
 for(const e of lines){assert.ok(svg.includes(`x="${e.x}" y="${e.baselineY}" font-size="${e.fontSize}"`));assert.equal(e.measurement,'estimated');assert.ok(Number.isFinite(e.width));assert.equal(e.resolvedFontFamily,null);}
 assert.equal(els.at(-1).role,'footer');
 }
});
test('AI backdrop is solid only for contained title; overflow retains panel',()=>{
 const a=makeTextLayout(['動画'],48,'#ffffff','#172554',true,'footer');
 assert.equal(a.elements[0].textBackdrop.kind,'solid');assert.equal(a.elements[1].textBackdrop.kind,'unknown');
 const b=makeTextLayout(['動'.repeat(60)],76,'#ffffff','#172554',true,'footer').elements[0];
 assert.equal(b.textBackdrop.kind,'unknown');assert.equal(b.textBackdrop.color,null);assert.equal(b.textRegion.width,800);
});

test('larger AI title remains bounded for long lines',()=>{assert.equal(aiTitleFontSize(['初心者のための動画制作']),64);assert.ok(aiTitleFontSize(['動'.repeat(15)])*15<=736);});

