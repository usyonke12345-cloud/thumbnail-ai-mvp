import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {makeServer} from '../backend/server.mjs';
const source=await readFile(new URL('../frontend/references.js',import.meta.url),'utf8');
function context(stored){
 function node(){return {children:[],textContent:'',append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;},addEventListener(){}};}
 const nodes=new Map();let sequence=0;
 const scope={document:{querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},createElement:node},localStorage:{getItem:()=>stored,setItem(){}},URL,crypto:{randomUUID:()=>`id-${++sequence}`}};
 vm.createContext(scope);vm.runInContext(source,scope);return {scope,nodes};
}
test('reference imports reject unsafe destinations and never accept imported permission claims',()=>{
 const {scope}=context(null),validate=vm.runInContext('validate',scope);
 for(const url of ['javascript:alert(1)','https://youtube.com.evil.example/','http://youtu.be/example','https://example.com/'])assert.throws(()=>validate([{url}]));
 const rows=validate([{url:'https://youtu.be/0dz-e5UtO5o',reason:'好き',permission:'approved',privateKey:'not-kept'}]);assert.equal(rows[0].permission,'unknown');assert.equal(rows[0].privateKey,undefined);
 assert.throws(()=>validate(Array(101).fill({url:'https://youtu.be/example'})));
});
test('valid stored notes survive initialization; damaged notes fall back without inventing analysis',()=>{
 const good=context(JSON.stringify([{url:'https://youtu.be/0dz-e5UtO5o',reason:'文字',rule:'文字を大きく'}]));assert.equal(good.nodes.get('#reference-list').children.length,3);assert.equal(vm.runInContext('rows[0].rule',good.scope),'文字を大きく');
 const bad=context('{broken');assert.equal(bad.nodes.get('#reference-list').children.length,5);assert.match(bad.nodes.get('#reference-status').textContent,/読み込めません/);
});
test('new references do not duplicate watch URLs or overwrite existing preferences',()=>{
 const {scope}=context(JSON.stringify([{url:'https://www.youtube.com/watch?v=HBluLfX2F_k',reason:'自分のメモ',rule:'配置ルール'}]));
 assert.equal(vm.runInContext('rows.length',scope),2);assert.equal(vm.runInContext('rows[0].reason',scope),'自分のメモ');
 assert.equal(vm.runInContext('rows[1].reason',scope),'');
});
test('reference pages are whitelisted local assets and do not expose the repository',async()=>{
 const server=makeServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const base=`http://127.0.0.1:${server.address().port}`;const page=await fetch(`${base}/references`);assert.equal(page.status,200);assert.match(await page.text(),/参考サムネ/);const script=await fetch(`${base}/references.js`);assert.equal(script.status,200);assert.match(script.headers.get('content-type'),/javascript/);assert.equal((await fetch(`${base}/.env`)).status,404);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('style brief preserves source notes without inventing rules or permission',()=>{
 const {scope}=context(null),brief=vm.runInContext('buildBrief',scope);
 const empty=brief([{url:'https://youtu.be/i72HxjCLlYY',reason:'',rule:''}]);
 assert.match(empty,/まだ未記入/);assert.match(empty,/許諾：未確認/);assert.match(empty,/i72HxjCLlYY/);
 const recorded=brief([{url:'https://youtu.be/example',reason:'文字が好き',rule:'文字を左に配置',palette:''}]);
 assert.match(recorded,/文字を左に配置/);assert.match(recorded,/ルール：1件/);assert.doesNotMatch(recorded,/配色・明暗:/);
});
