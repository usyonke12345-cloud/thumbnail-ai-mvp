import test from 'node:test';
import assert from 'node:assert/strict';
import {composePortraitPrototype} from '../backend/generation/portrait-prototype.mjs';
const background='data:image/png;base64,iVBORw0KGgo=';
test('portrait headline stays in center and never claims image contrast was measured',()=>{
 for(const lines of [undefined,['FIND YOUR','PERFECT','HAIRSTYLE'],['W'.repeat(24),'長い文字'.repeat(6),'FOUR','LINES']]){
  const result=composePortraitPrototype(background,lines);
  for(const e of result.metadata.textLayout.elements){assert.ok(e.x>=386);assert.ok(e.x+e.width<=894);assert.ok(e.topY>=146);assert.ok(e.topY+e.height<=574);assert.equal(e.textBackdrop.kind,'image');}
  assert.ok(result.svg.includes(background));
 }
});
test('portrait rejects malformed background and unmeasurable or invalid headings',()=>{
 for(const lines of [[],[''],['A'.repeat(25)],['bad\nline'],['🎬']])assert.throws(()=>composePortraitPrototype(background,lines));
 assert.throws(()=>composePortraitPrototype('https://example.com/image.png'));
});
