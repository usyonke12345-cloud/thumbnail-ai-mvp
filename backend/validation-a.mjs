import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ApiError} from '../shared/contracts.mjs';
import {validateComplete,COMPLETE_GENERATION_VERSION} from './generation/complete.mjs';
import {COMPLETE_IMAGE_SETTINGS} from './generation/openai.mjs';
import {completePrompt} from './generation/complete-prompt.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
// Capture the running build at module load, rather than labelling modified files
// on disk as the code already loaded by a long-running Node process.
const sourceFiles=['backend/server.mjs','backend/validation-a.mjs','backend/generation/complete.mjs','backend/generation/complete-prompt.mjs','backend/generation/complete-editorial.mjs','backend/generation/complete-reference-patterns.mjs','backend/generation/openai.mjs','shared/contracts.mjs','shared/complete-designs.mjs','shared/complete-images.mjs','shared/generation-feedback.mjs','shared/reviewer-id.mjs','shared/evaluation-split.mjs','frontend/editor.js','frontend/editor-layout.js','frontend/editor-draft.js','frontend/validation-a.js','frontend/local-archive.js','package.json','package-lock.json'];
const build=Promise.all(sourceFiles.map(async path=>({path,sha256:hash(await readFile(new URL('../'+path,import.meta.url)))}))).then(files=>({files,sourceSha256:hash(JSON.stringify(files)),nodeVersion:process.version}));

export async function freezeValidationA(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||'consent' in value||'feedback' in value||'revision' in value)throw new ApiError(400,'INVALID_VALIDATION_A','A検証の固定入力には、送信同意・評価メモ・修正元を含めないでください。');
 // Validation only: this function never calls an image provider.
 const v=validateComplete({...value,consent:true});
 const input={title:v.title,brief:v.brief,visualIntent:v.visualIntent??'',headlineMode:v.headlineMode,headline:v.headline,design:v.design,composition:v.composition};
 const bytes=Buffer.from(v.imageDataUrl.slice(22),'base64'),source={path:'source.png',sha256:hash(bytes),bytes:bytes.length,width:1280,height:720};
 const requestSha256=hash(JSON.stringify({input,sourceSha256:source.sha256}));
 const service={generationVersion:COMPLETE_GENERATION_VERSION,...COMPLETE_IMAGE_SETTINGS,endpoint:'images/edits',feedbackUsed:false,revisionUsed:false,...await build};
 const servicePrompt=completePrompt(v),servicePromptSha256=hash(servicePrompt);
 const caseId='validation-a-'+hash(JSON.stringify({requestSha256,service,servicePromptSha256}));
 const chatgptPrompt=[
  '添付写真を使って、YouTube用の16:9のサムネイルを1枚作ってください。',
  '写真の人物・場面を自然に保ち、顔や大切な素材を文字で隠さないでください。',
  `動画タイトル：${input.title}`,
  `動画内容の補足：${input.brief||'なし'}`,
  `仕上がりの希望：${input.visualIntent||'指定なし'}`,
  `見出し：${input.headlineMode==='auto'?'タイトルから短い見出しを考えてください':input.headline}`,
  ...(input.design==='auto'?[]:[`デザインの方向：${{photo_focus:'写真全面を主役にし、下部にサンセリフの見出し',editorial:'落ち着いた誌面風。上部にセリフ・明朝の見出し',impact:'横に細長い太字の見出しを大きく見せる'}[input.design]}`]),
  ...(input.composition==='auto'?[]:[`文字の配置：${{text_left:'左',text_right:'右',text_top:'上'}[input.composition]}。デザインの既定位置よりこちらを優先してください。`]),
  '内容に合う字体と構成を選び、小さく表示しても読みやすくしてください。'
 ].join('\n');
 return {version:'validation-a-case-1.0.0',caseId,createdAt:new Date().toISOString(),hypothesis:'A',input,source,requestSha256,service,servicePromptSha256,servicePrompt,chatgptPrompt};
}

export async function checkValidationARequest(body,caseId){
 if(!/^validation-a-[a-f0-9]{64}$/.test(caseId))throw new ApiError(400,'VALIDATION_A_MISMATCH','A検証の固定IDが不正です。入力を固定し直してください。');
 const {consent,...value}=body??{};
 const fixed=await freezeValidationA(value);
 if(fixed.caseId!==caseId)throw new ApiError(409,'VALIDATION_A_MISMATCH','写真・入力・生成版が固定時と変わりました。生成せずに停止しました。別ケースとして固定し直してください。');
 return {caseId:fixed.caseId,requestSha256:fixed.requestSha256,sourceSha256:fixed.source.sha256,serviceSourceSha256:fixed.service.sourceSha256,feedbackUsed:false};
}
