import test from 'node:test';
import assert from 'node:assert/strict';
import {completePreview} from '../backend/analysis/complete-preview.mjs';
import {createCompleteReviewAnalysis} from '../backend/analysis/complete-review.mjs';
import {bundle} from './helpers/complete-png.mjs';
import {runInNewContext} from 'node:vm';

async function dataset(options){const analysis=createCompleteReviewAnalysis();await analysis.consume(await bundle(options));return analysis.finish();}

test('private preview preserves image order, local assets and human records without inventing quality or confirmed costs',async()=>{
 const data=await dataset(),html=completePreview(data);
 assert.ok(html.includes('元写真')&&html.includes('完成案 1')&&html.includes('完成案 2'));
 const sources=[...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(sources,[data.assets.find(x=>x.assetId===data.groups[0].sourcePhotoAssetId).path,...data.images.map(image=>data.assets.find(x=>x.assetId===image.assetId).path)]);
 assert.ok(html.includes(data.reviews[0].reason)&&html.includes('全部使わない'));
 assert.ok(html.includes('確認済み実費：未確認')&&html.includes('PNG保存：未確認'));
 assert.ok(html.includes('自動では採点していません')&&html.includes('新しい比較記録になりません'));
 assert.ok(!html.includes('fetch(')&&!html.includes('data:image')&&!html.includes('localStorage'));
});

test('one image is a quality confirmation and an unavailable PNG is not displayed as a valid candidate',async()=>{
 const data=await dataset({count:1});let html=completePreview(data);
 assert.ok(html.includes('完成画像が1枚のため品質確認のみ')&&html.includes('0 / 20組'));
 const complete=data.assets.find(x=>x.role==='complete_thumbnail');complete.diagnostic={status:'unavailable',reasons:['壊れた画像']};
 html=completePreview(data);assert.ok(html.includes('壊れた画像'));assert.equal([...html.matchAll(/<img /g)].length,1);
});

test('untrusted text is escaped and changed asset paths or roles cannot cause the page to load arbitrary images',async()=>{
 const data=await dataset();data.groups[0].input.title='</h2><script>untrusted()</script>';data.reviews[0].reason='<img src="https://example.com" onerror="bad()">';
 const html=completePreview(data);assert.ok(html.includes('&lt;script&gt;untrusted()&lt;/script&gt;'));assert.ok(!html.includes('<script>untrusted()'));
 assert.ok(html.includes('&lt;img src=&quot;https://example.com&quot;'));
 for(const path of ['https://example.com/a.png','../private.png','assets/other.png']){const changed=structuredClone(data);changed.assets[0].path=path;assert.throws(()=>completePreview(changed),/相対パス/);}
 const changed=structuredClone(data);changed.assets[0].role='complete_thumbnail';assert.throws(()=>completePreview(changed),/役割/);
});

test('viewing-width buttons only change the display width and selected state',async()=>{
 const html=completePreview(await dataset()),script=html.match(/<script>([\s\S]*?)<\/script>/)[1],events=new Map(),properties=new Map();
 const buttons=['168','246','360','720'].map(width=>({dataset:{width},pressed:width==='360'?'true':'false',addEventListener(event,handler){assert.equal(event,'click');events.set(width,handler);},setAttribute(name,value){assert.equal(name,'aria-pressed');this.pressed=value;}}));
 runInNewContext(script,{document:{querySelectorAll:selector=>{assert.equal(selector,'[data-width]');return buttons;},documentElement:{style:{setProperty:(name,value)=>properties.set(name,value)}}}});
 for(const width of ['168','246','720']){events.get(width)();assert.equal(properties.get('--preview-width'),width+'px');assert.deepEqual(buttons.map(x=>x.pressed),buttons.map(x=>String(x.dataset.width===width)));}
});
