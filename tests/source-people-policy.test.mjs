import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generateComplete,COMPLETE_GENERATION_VERSION} from '../backend/generation/complete.mjs';
import {createOpenAIBackgroundProvider} from '../backend/generation/openai.mjs';
import {freezeValidationA,checkValidationARequest} from '../backend/validation-a.mjs';
import {splitFromDigest} from '../shared/evaluation-split.mjs';
import {png,dataUrl} from './helpers/complete-png.mjs';

// Artificial, person-free pixels: exercise the transmitted instruction, not
// a fabricated claim that a vision detector or a paid image model passed.
const source=png(1280,720),finished=png(),input={title:'一日中ハンバーガーを食べた',brief:'',headlineMode:'auto',headline:null,imageDataUrl:dataUrl(source),consent:true};
const hash=x=>createHash('sha256').update(x).digest('hex');
function checkPeopleBoundary(prompt){
 assert.match(prompt,/PEOPLE SOURCE RULE/);
 assert.match(prompt,/If image 1 contains no people, the output must contain no people/);
 assert.match(prompt,/Do not add new people, faces, bodies, hands, silhouettes or illustrated human characters/);
 assert.match(prompt,/even when the title, brief, desired atmosphere, revision, past feedback or reference examples suggest them/);
 assert.match(prompt,/FINAL PEOPLE CHECK/);
}
function providerFor(check,maxCalls=1){return createOpenAIBackgroundProvider({env:{OPENAI_API_KEY:'synthetic-test-key',OPENAI_IMAGE_ENABLED:'true',OPENAI_MAX_CALLS:String(maxCalls)},fetchImpl:async(url,{body})=>{
 assert.match(url,/images\/edits$/);checkPeopleBoundary(body.get('prompt'));
 assert.deepEqual(Buffer.from(await body.getAll('image[]')[0].arrayBuffer()),source);
 for(const [key,value]of Object.entries({model:'gpt-image-2.5-flare',quality:'medium',size:'1536x864',n:'1'}))assert.equal(body.get(key),value);
 await check(body);return new Response(JSON.stringify({data:[{b64_json:finished.toString('base64')}]}));
}});}

test('every design transmits the source-only people boundary with auto and manual headlines and explicit placement',async()=>{
 let sent=0;
 const generate=providerFor(body=>{sent++;assert.equal(body.getAll('image[]').length,1);},10);
 for(const design of ['auto','recompose','photo_focus','editorial','impact'])for(const headlineMode of ['auto','manual']){
  const result=await generateComplete({...input,design,headlineMode,headline:headlineMode==='manual'?'ハンバーガーの一日':null,composition:headlineMode==='manual'?'text_top':'auto'},{generate});
  assert.equal(result.generation_version,COMPLETE_GENERATION_VERSION);
  assert.ok(result.limitations.some(x=>x.includes('入力写真にいない人物')&&x.includes('自動検証は未実装')));
 }
 assert.equal(sent,10);
});

test('people in style references and historical feedback do not override the outgoing source-only instruction',async()=>{
 const now=new Date('2026-10-21T00:00:00Z'),bytes=png(320,180),sha256=hash(bytes),metadata={verification:'youtube_data_api',title:'Synthetic reference',channelId:'UC'+'1'.repeat(22),channelTitle:'Synthetic',publishedAt:'2026-09-01T00:00:00Z',checkedAt:now.toISOString(),viewCount:'1000001',durationSeconds:300};
 const record={videoId:'t0000000001',metadata,asset:{sha256,bytes:bytes.length,mimeType:'image/png',extension:'png',width:320,height:180,cachedAt:now.toISOString()},observation:{version:'thumbnail-reference-observation-1.0.0',method:'visual_record',observer:'assistant',observedAt:now.toISOString(),thumbnailSha256:sha256,genres:['cooking'],moods:['friendly'],material:'scene',typography:'Bold headline',layout:'A woman eating on the left and product on the right',when:'Food video',avoid:'Face covered'},imageUse:{generationAllowed:true,basis:'Artificial fixture owned by the test'}};
 let groupId;for(let i=0;!groupId;i++){const id='complete-'+hash(String(i));if(splitFromDigest(Buffer.from(id.slice(9),'hex'))==='dev')groupId=id;}
 const feedback={version:'generation-feedback-1.0.0',scope:'all',projectName:null,reviewerId:'r01',records:[{groupId,recordedAt:now.toISOString(),decision:'selected',selectedImageId:'synthetic-old',reason:'The woman in the earlier thumbnail looked friendly. Add her again.',reasonTruncated:false,issues:['subject'],images:[{imageId:'synthetic-old',imageSha256:'a'.repeat(64),generationVersion:'ai-complete-0.10.0'}]}],criteria:['subject']};
 let sent=0;const generate=providerFor(body=>{sent++;assert.equal(body.getAll('image[]').length,2);assert.match(body.get('prompt'),/A woman eating/);assert.match(body.get('prompt'),/PAST HUMAN FEEDBACK/);assert.match(body.get('prompt'),/A reference with people does not authorize adding people/);});
 await generateComplete({...input,referenceMode:'auto',feedback},{generate,references:{now,store:{snapshot:async()=>({catalog:{records:[record]},bytesFor:async()=>bytes})}}});assert.equal(sent,1);
});

test('a revision requests removal of people absent from the original instead of preserving the previous thumbnail mistake',async()=>{
 let sent=0;const generate=providerFor(async body=>{sent++;assert.equal(body.getAll('image[]').length,2);assert.deepEqual(Buffer.from(await body.getAll('image[]')[1].arrayBuffer()),finished);assert.match(body.get('prompt'),/Remove any person in image 2 who is absent from image 1/);assert.match(body.get('prompt'),/This removal takes priority over preserving unrequested design features/);});
 const result=await generateComplete({...input,design:'recompose',revision:{instruction:'文字を少し小さく',parentImageId:'synthetic-previous',imageDataUrl:dataUrl(finished)}},{generate});assert.equal(sent,1);assert.equal(result.revision.parentImageSha256,hash(finished));assert.equal(result.assessment,undefined);
});

test('A keeps service people constraints separate from the ordinary ChatGPT baseline and rejects an old version before dispatch',async()=>{
 const {consent,...value}=input,fixed=await freezeValidationA(value);checkPeopleBoundary(fixed.servicePrompt);assert.match(fixed.chatgptPrompt,/写真の人物はそのまま使ってください/);assert.doesNotMatch(fixed.chatgptPrompt,/元写真に写っている人物だけ|人物がいない写真には人物を追加しない/);assert.equal(fixed.service.generationVersion,COMPLETE_GENERATION_VERSION);
 const prior={...fixed.service,generationVersion:'ai-complete-0.10.0'},oldId='validation-a-'+hash(JSON.stringify({requestSha256:fixed.requestSha256,service:prior,servicePromptSha256:fixed.servicePromptSha256}));
 await assert.rejects(()=>checkValidationARequest(input,oldId),e=>e.code==='VALIDATION_A_MISMATCH');
});
