import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ApiError} from '../shared/contracts.mjs';
import {validateComplete,completeGenerationVersion} from './generation/complete.mjs';
import {COMPLETE_IMAGE_SETTINGS} from './generation/openai.mjs';
import {completePrompt} from './generation/complete-prompt.mjs';
import {prepareCompleteReferences,frozenReferenceAssets} from './references/selection.mjs';
import {sourcePhotoInputs} from '../shared/multi-photo.mjs';
import {ordinaryChatgptPrompt} from '../shared/validation-a-baseline.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
// Capture the running build at module load, rather than labelling modified files
// on disk as the code already loaded by a long-running Node process.
const sourceFiles=['backend/server.mjs','backend/validation-a.mjs','backend/generation/complete.mjs','backend/generation/complete-prompt.mjs','backend/generation/complete-multi-prompt.mjs','backend/generation/complete-photo-finish.mjs','backend/generation/complete-editorial.mjs','backend/generation/complete-reference-patterns.mjs','backend/generation/openai.mjs','backend/references/selection.mjs','backend/references/store.mjs','backend/references/youtube.mjs','backend/references/settings.mjs','shared/thumbnail-references.mjs','shared/contracts.mjs','shared/complete-designs.mjs','shared/complete-images.mjs','shared/multi-photo.mjs','shared/generation-feedback.mjs','shared/reviewer-id.mjs','shared/evaluation-split.mjs','shared/validation-a-baseline.mjs','frontend/editor.js','frontend/multi-photo.js','frontend/editor-layout.js','frontend/editor-draft.js','frontend/validation-a.js','frontend/local-archive.js','package.json','package-lock.json'];
const build=Promise.all(sourceFiles.map(async path=>({path,sha256:hash(await readFile(new URL('../'+path,import.meta.url)))}))).then(files=>({files,sourceSha256:hash(JSON.stringify(files)),nodeVersion:process.version}));

export async function freezeValidationA(value,{references}={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||'consent' in value||'feedback' in value||'revision' in value)throw new ApiError(400,'INVALID_VALIDATION_A','A検証の固定入力には、送信同意・評価メモ・修正元を含めないでください。');
 // Validation only: this function never calls an image provider.
 const v=await prepareCompleteReferences(validateComplete({...value,consent:true}),references);
 const input={title:v.title,brief:v.brief,visualIntent:v.visualIntent??'',headlineMode:v.headlineMode,headline:v.headline,design:v.design,composition:v.composition,...(v.referenceMode!==undefined?{referenceMode:v.referenceMode}:{})};
 const bytes=Buffer.from(v.imageDataUrl.slice(22),'base64'),source={path:'source.png',sha256:hash(bytes),bytes:bytes.length,width:1280,height:720};
 const additionalSources=sourcePhotoInputs(v).slice(1).map((url,i)=>{const bytes=Buffer.from(url.slice(22),'base64');return {path:`source-${i+2}.png`,sha256:hash(bytes),bytes:bytes.length,width:1280,height:720};});
 const additionalSourceSha256s=additionalSources.map(x=>x.sha256);
 const requestSha256=hash(JSON.stringify({input,sourceSha256:source.sha256,...(additionalSources.length?{additionalSourceSha256s}:{})}));
 const service={generationVersion:completeGenerationVersion(v),...COMPLETE_IMAGE_SETTINGS,endpoint:'images/edits',feedbackUsed:false,revisionUsed:false,...await build,...(v._references?{referenceContext:v._references.context}:{})};
 const servicePrompt=completePrompt(v),servicePromptSha256=hash(servicePrompt);
 const caseId='validation-a-'+hash(JSON.stringify({requestSha256,service,servicePromptSha256}));
 const chatgptPrompt=ordinaryChatgptPrompt(input,{sourcePhotoCount:1+additionalSources.length});
 const referenceAssets=frozenReferenceAssets(v);
 return {version:additionalSources.length?'validation-a-case-1.1.0':'validation-a-case-1.0.0',caseId,createdAt:new Date().toISOString(),hypothesis:'A',input,source,...(additionalSources.length?{additionalSources}:{}),requestSha256,service,servicePromptSha256,servicePrompt,chatgptPrompt,...(referenceAssets.length?{referenceAssets}:{})};
}

export async function checkValidationARequest(body,caseId,options={}){
 if(!/^validation-a-[a-f0-9]{64}$/.test(caseId))throw new ApiError(400,'VALIDATION_A_MISMATCH','A検証の固定IDが不正です。入力を固定し直してください。');
 const {consent,...value}=body??{};
 const fixed=await freezeValidationA(value,options);
 if(fixed.caseId!==caseId)throw new ApiError(409,'VALIDATION_A_MISMATCH','写真・入力・生成版が固定時と変わりました。生成せずに停止しました。別ケースとして固定し直してください。');
 return {caseId:fixed.caseId,requestSha256:fixed.requestSha256,sourceSha256:fixed.source.sha256,serviceSourceSha256:fixed.service.sourceSha256,feedbackUsed:false,...(fixed.additionalSources?.length?{additionalSourceSha256s:fixed.additionalSources.map(x=>x.sha256)}:{}),...(fixed.service.referenceContext?{referenceContext:fixed.service.referenceContext}:{})};
}
