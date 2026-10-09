import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDraft} from '../frontend/editor-draft.js';
const draft={version:1,layout:'single',settings:[{zoom:1,x:.5,y:.5},{zoom:2,x:0,y:1}],files:[new Blob(['photo'],{type:'image/png'}),null],headline:'自分の見出し',title:'動画',brief:'内容',accent:'#ffdc24',position:'right',protect:'left',shade:45,result:{imageDataUrl:'data:image/png;base64,iVBORw0KGgo='}};
test('draft restores photos, text, layout and result without retaining paid consent',()=>{
 const restored=validateDraft(structuredClone({...draft,consent:true,apiKey:'never-store'}));
 assert.equal(restored.headline,draft.headline);assert.equal(restored.files[0].type,'image/png');assert.equal(restored.position,'right');assert.equal(restored.result.imageDataUrl,draft.result.imageDataUrl);assert.equal(restored.consent,undefined);assert.equal(restored.apiKey,undefined);
 assert.equal(restored.composition,'auto');assert.equal(validateDraft({...draft,composition:'text_top'}).composition,'text_top');
 const completed=validateDraft({...draft,result:{...draft.result,generation_version:'ai-complete-0.1.2',limitations:['未採点'],apiKey:'never-store'}}).result;
 assert.equal(completed.generation_version,'ai-complete-0.1.2');assert.deepEqual(completed.limitations,['未採点']);assert.equal(completed.apiKey,undefined);
});
test('corrupt draft versions, crop settings and unsafe result URLs are rejected',()=>{
 for(const value of [{...draft,version:2},{...draft,settings:[{zoom:3,x:0,y:0},draft.settings[1]]},{...draft,result:{imageDataUrl:'javascript:alert(1)'}},{...draft,files:[new Blob(['x'],{type:'text/html'}),null]}])assert.throws(()=>validateDraft(value));
});
