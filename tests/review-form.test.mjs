import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {generate} from '../backend/generation/index.mjs';
import {score} from '../backend/scoring/index.mjs';
import {freezeComparison,validateSet,validateReview,splitFor,partnerRows,csv,PREFERENCE_FIELDS,summarizeReviews} from '../frontend/comparison-model.js';
const html=await readFile(new URL('../frontend/review.html',import.meta.url),'utf8');
const source=(await readFile(new URL('../frontend/review.js',import.meta.url),'utf8')).replace(/^import .*;\r?$/gm,'');
const input={title:'自分の動画のタイトル',genre:'other'},candidates=await Promise.all((await generate(input)).map(async c=>({...c,assessment:await score(c,{})})));
const set=freezeComparison({mode:'demo',input,candidates,elapsedMs:100},'test-form');
async function setup({empty=false,rejectSave=false}={}){
 const nodes={},reviews=[];let saves=0,focused=null;
 function element(tag,id=''){return {id,tag,value:'',textContent:'',hidden:false,disabled:false,style:{},dataset:{},children:[],events:{},append(...items){this.children.push(...items);if(this.id==='sets'&&!this.value)this.value=items[0]?.value??'';},replaceChildren(...items){this.children=[...items];if(this.id==='sets')this.value='';},addEventListener(event,fn){this.events[event]=fn;},getBoundingClientRect(){return {width:360};},querySelector(selector){if(selector===':invalid')return nodes[nodes['review-form'].invalid];return this.children.flatMap(c=>[c,...c.children]).find(c=>c.tag===selector);},querySelectorAll(selector){return this.children.flatMap(c=>[c,...c.children]).filter(c=>c.tag===selector);},focus(){focused=this.id;}};}
 for(const match of html.matchAll(/id="([^"]+)"/g))nodes[match[1]]=element('input',match[1]);
 Object.assign(nodes['review-form'],{invalid:null,reset(){for(const id of ['sample','reviewer','source','source-url','permission-date','decision','ranking','reason','os','browser','cost'])nodes[id].value='';nodes.permission.value='none';nodes.failure.value='none';nodes.saved.value='unknown';nodes['permission-confirmed'].checked=false;},checkValidity(){this.invalid=['sample','reviewer','source','decision','os','browser'].find(id=>!nodes[id].value)??null;return !this.invalid;}});
 nodes.width.value='360';nodes['review-form'].reset();
 const context={document:{getElementById:id=>nodes[id],createElement:tag=>element(tag)},navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0'},validateSet,validateReview,partnerRows,csv,PREFERENCE_FIELDS,summarizeReviews,Blob,URL,setTimeout,console,listSets:async()=>empty?[]:[set],listReviews:async()=>reviews,saveSet:async()=>{},saveReview:async(value,s)=>{saves++;if(rejectSave)throw new Error('保存容量が足りません。');const r={...value,split:await splitFor(value.sampleId)};validateReview(r,s);reviews.push(r);}};
 vm.runInNewContext(source,context);await new Promise(resolve=>setImmediate(resolve));
 return {nodes,reviews,saves:()=>saves,focused:()=>focused,submit:()=>nodes['review-form'].events.submit({preventDefault(){}})};
}
test('required missing fields produce nearby feedback and focus instead of a silent submit',async()=>{assert.match(html,/<form id="review-form" novalidate/);const app=await setup();assert.equal(app.nodes['save-review'].disabled,false);await app.submit();assert.match(app.nodes['review-feedback'].textContent,/タイトルの由来/);assert.equal(app.focused(),'source');assert.equal(app.saves(),0);app.nodes.source.value='synthetic';await app.submit();assert.match(app.nodes['review-feedback'].textContent,/選択/);assert.equal(app.focused(),'decision');});
test('practice with no URL or permission records successfully and leaves button usable',async()=>{const app=await setup();app.nodes.source.value='synthetic';app.nodes.decision.value='bold';await app.submit();assert.equal(app.saves(),1);assert.equal(app.reviews[0].sourceUrl,'');assert.equal(app.reviews[0].permission,'none');assert.equal(app.nodes['save-review'].disabled,false);assert.match(app.nodes['review-feedback'].textContent,/保存しました/);assert.match(app.nodes.progress.textContent,/人による比較：1 \/ 20件/);assert.match(app.nodes.progress.textContent,/実タイトル：0 \/ 20件/);});
test('storage errors are explained beside the button and allow another attempt',async()=>{const app=await setup({rejectSave:true});app.nodes.source.value='synthetic';app.nodes.decision.value='none';await app.submit();assert.match(app.nodes['review-feedback'].textContent,/容量/);assert.equal(app.nodes['save-review'].disabled,false);});
test('an empty saved list explains how to save a set and can be refreshed explicitly',async()=>{const app=await setup({empty:true});assert.equal(app.nodes['save-review'].disabled,true);assert.match(app.nodes.status.textContent,/固定保存/);assert.equal(typeof app.nodes.refresh.events.click,'function');});
