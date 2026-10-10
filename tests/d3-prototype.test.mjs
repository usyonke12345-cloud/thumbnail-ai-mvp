import test from 'node:test';
import assert from 'node:assert/strict';
import {composeD3Prototype} from '../backend/generation/d3-prototype.mjs';
test('D3 titles from 1 to 60 characters preserve text and stay in the central region',()=>{
 for(const title of ['動','努力だけでは差がつかない','動画'.repeat(30),'W'.repeat(60),'iiii'.repeat(15),'初心者がAIで動画制作を始めるためのコツ']){
  const result=composeD3Prototype(title),elements=result.metadata.textLayout.elements;
  assert.equal(elements.map(e=>e.text).join(''),title);
  for(const e of elements){assert.equal(e.measurement,'estimated');assert.ok(e.x>=316);assert.ok(e.x+e.width<=964);assert.ok(e.topY>=186);assert.ok(e.topY+e.height<=524);}
 }
});
test('D3 unsupported glyphs keep full graphemes and mark bounds unknown',()=>{
 const title='家族👨‍👩‍👧‍👦と動画制作';
 const elements=composeD3Prototype(title).metadata.textLayout.elements;
 assert.equal(elements.map(e=>e.text).join(''),title);
 assert.ok(elements.some(e=>e.text.includes('👨‍👩‍👧‍👦')&&e.measurement==='unknown'&&e.width===null));
 for(const title of ['', '動'.repeat(61),'文字\n改行'])assert.throws(()=>composeD3Prototype(title));
});
