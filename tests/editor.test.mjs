import test from 'node:test';
import assert from 'node:assert/strict';
import {cropPlacement,fitHeadline,suggestPhotoLayouts} from '../frontend/editor-layout.js';
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
test('auto layout chooses dark uncluttered space and strengthens shade over bright space',()=>{
 const width=320,height=180,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=x<155?20:240;data[i+3]=255;}
 const choices=suggestPhotoLayouts({data,width,height});assert.equal(choices[0].position,'left');assert.ok(choices.find(c=>c.position==='right').shade>choices[0].shade);assert.equal(new Set(choices.map(c=>c.position)).size,3);
 assert.throws(()=>suggestPhotoLayouts({data:[],width:320,height:180}));
});
test('subject protection outranks dark space that covers the subject',()=>{
 const width=320,height=180,data=new Uint8ClampedArray(width*height*4);
 const choices=suggestPhotoLayouts({data,width,height},[{x:0,y:0,width:420,height:720}]);
 assert.equal(choices[0].position,'right');assert.equal(choices[0].overlap,0);assert.ok(choices.find(c=>c.position==='left').overlap>0);
 const all=suggestPhotoLayouts({data,width,height},[{x:0,y:0,width:1280,height:720}]);assert.ok(all.every(c=>c.overlap>0));
});
test('headline wraps ordinary English words at word boundaries',()=>{
 const fitted=fitHeadline('FIND YOUR PERFECT HAIRSTYLE',(text,size)=>text.length*size*.6,540,480);
 assert.equal(fitted.lines.join(' '),'FIND YOUR PERFECT HAIRSTYLE');
 assert.ok(fitted.lines.every(line=>line.split(' ').every(word=>['FIND','YOUR','PERFECT','HAIRSTYLE'].includes(word))));
});

