import test from 'node:test';
import assert from 'node:assert/strict';
import {cropPlacement,fitHeadline} from '../frontend/editor-layout.js';
import {makeServer} from '../backend/server.mjs';
test('photo crop always covers its frame at each crop edge and zoom',()=>{
 for(const [width,height]of [[100,1000],[1000,100],[1280,720]])for(const zoom of [1,2])for(const x of [0,1])for(const y of [0,1]){
  const box={x:940,y:0,width:340,height:720},p=cropPlacement(width,height,box,zoom,x,y);
  assert.ok(p.x<=box.x&&p.y<=box.y);assert.ok(p.x+p.width>=box.x+box.width);assert.ok(p.y+p.height>=box.y+box.height);
 }
 assert.throws(()=>cropPlacement(0,100,{width:20,height:20}));
});
test('headline retains grapheme clusters and fits available space',()=>{
 const title='家族👨‍👩‍👧‍👦で動画を制作する',measure=(text,size)=>[...new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(text)].length*size;
 const fit=fitHeadline(title,measure,540,480);assert.equal(fit.lines.join(''),title);assert.ok(fit.lines.some(line=>line.includes('👨‍👩‍👧‍👦')));assert.ok(fit.lines.every(line=>measure(line,fit.size)<=540));assert.ok(fit.lines.length*fit.size*1.18<=480);
 assert.throws(()=>fitHeadline('',measure,540,480));
});
test('photo editor and module assets are available without changing generation API',async()=>{
 const server=makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{for(const path of ['/editor','/editor.js','/editor-layout.js']){const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`);assert.equal(response.status,200);assert.equal(response.headers.get('x-content-type-options'),'nosniff');}}finally{await new Promise(resolve=>server.close(resolve));}
});
