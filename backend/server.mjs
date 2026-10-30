import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runPipeline } from './pipeline.mjs';
import { ApiError } from '../shared/contracts.mjs';
import { generationMode } from './generation/index.mjs';
import {generateComplete} from './generation/complete.mjs';
import {generateBackground} from './generation/openai.mjs';
import {analyzePngAssets,MAX_JSON_BYTES} from './analysis/complete-png.mjs';
import {freezeValidationA,checkValidationARequest} from './validation-a.mjs';
import {referenceStore} from './references/store.mjs';
import {youtubeApiKey} from './references/settings.mjs';
import {prepareCompleteReferences} from './references/selection.mjs';
const assets=new Map([['/complete-gallery.js',['complete-gallery.js','text/javascript; charset=utf-8']],['/complete-gallery-model.js',['complete-gallery-model.js','text/javascript; charset=utf-8']],['/complete-gallery-store.js',['complete-gallery-store.js','text/javascript; charset=utf-8']],['/review', ['review.html','text/html; charset=utf-8']],['/review.js',['review.js','text/javascript; charset=utf-8']],['/comparison-model.js',['comparison-model.js','text/javascript; charset=utf-8']],['/comparison-store.js',['comparison-store.js','text/javascript; charset=utf-8']],["/editor-draft.js",["editor-draft.js","text/javascript; charset=utf-8"]],['/editor',['editor.html','text/html; charset=utf-8']],['/editor.js',['editor.js','text/javascript; charset=utf-8']],['/editor-layout.js',['editor-layout.js','text/javascript; charset=utf-8']],['/', ['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/references',['references.html','text/html; charset=utf-8']],['/references.js',['references.js','text/javascript; charset=utf-8']]]);
assets.set('/complete-png-transfer.js',['complete-png-transfer.js','text/javascript; charset=utf-8']);
assets.set('/feedback-memory.js',['feedback-memory.js','text/javascript; charset=utf-8']);
assets.set('/validation-a.js',['validation-a.js','text/javascript; charset=utf-8']);
assets.set('/shared/generation-feedback.mjs',['../shared/generation-feedback.mjs','text/javascript; charset=utf-8']);
assets.set('/shared/reviewer-id.mjs',['../shared/reviewer-id.mjs','text/javascript; charset=utf-8']);
assets.set('/shared/evaluation-split.mjs',['../shared/evaluation-split.mjs','text/javascript; charset=utf-8']);
assets.set('/shared/validation-a-baseline.mjs',['../shared/validation-a-baseline.mjs','text/javascript; charset=utf-8']);
assets.set('/subject-regions.js',['subject-regions.js','text/javascript; charset=utf-8']);
assets.set('/multi-photo.js',['multi-photo.js','text/javascript; charset=utf-8']);
assets.set('/shared/multi-photo.mjs',['../shared/multi-photo.mjs','text/javascript; charset=utf-8']);
for(const file of ['local-archive.js','editor-tools.js','attempt-history.js','editor-backup.js','image-save.js'])assets.set('/'+file,[file,'text/javascript; charset=utf-8']);
assets.set('/editor-design-guide.js',['editor-design-guide.js','text/javascript; charset=utf-8']);
assets.set('/shared/complete-designs.mjs',['../shared/complete-designs.mjs','text/javascript; charset=utf-8']);
assets.set('/shared/complete-images.mjs',['../shared/complete-images.mjs','text/javascript; charset=utf-8']);
assets.set('/shared/thumbnail-references.mjs',['../shared/thumbnail-references.mjs','text/javascript; charset=utf-8']);
for(const path of ['reference-library.html','reference-library.js','editor-references.js'])assets.set(path.endsWith('.html')?'/reference-library':'/'+path,[path,path.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8']);
export function makeServer({complete=generateComplete,referenceLibrary=referenceStore,referenceClock=()=>new Date()}={}) {
  const server=createServer(async(req,res)=> {
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET' && path==='/api/v1/health') return send(200,{status:'ok',mode:generationMode(),completeGeneration:generateBackground.getStatus()});
      if(req.method==='GET'&&path==='/api/v1/reference-library')return send(200,{...await referenceLibrary.list(),youtubeKeyConfigured:!!await youtubeApiKey()});
      if(req.method==='GET'&&/^\/api\/v1\/reference-library\/thumbnail\/[A-Za-z0-9_-]{11}$/.test(path)){const image=await referenceLibrary.thumbnail(path.split('/').at(-1));res.writeHead(200,{'Content-Type':image.mimeType,'Content-Length':image.bytes.length,'X-Thumbnail-SHA256':image.sha256,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(image.bytes);}
      if(req.method==='GET' && assets.has(path)) {
        const [file,mime]=assets.get(path), content=await readFile(new URL(`../frontend/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(content);
      }
      if(!['/api/v1/thumbnails','/api/v1/complete-thumbnail','/api/v1/complete-diagnostics','/api/v1/validation-a/freeze','/api/v1/reference-library/collect','/api/v1/reference-library/observe','/api/v1/reference-library/preview'].includes(path)) return send(404,{error:{code:'NOT_FOUND',message:'ページがありません。'}});
      if(req.method!=='POST') {res.setHeader('Allow','POST');return send(405,{error:{code:'METHOD_NOT_ALLOWED',message:'POSTを使用してください。'}});}
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json') throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','application/jsonを指定してください。');
      let size=0;const chunks=[];
      for await (const chunk of req) {size+=chunk.length;if(size>(path==='/api/v1/complete-diagnostics'?MAX_JSON_BYTES:path==='/api/v1/validation-a/freeze'?10*1024*1024:path==='/api/v1/complete-thumbnail'?32*1024*1024:16384)) throw new ApiError(413,'BODY_TOO_LARGE','入力が大きすぎます。');chunks.push(chunk);}
      let body;try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch {throw new ApiError(400,'INVALID_JSON','JSONが不正です。');}
      if(path==='/api/v1/reference-library/collect'){if(!body||Array.isArray(body)||Object.keys(body).length)throw new ApiError(400,'INVALID_INPUT','収集の入力は空のオブジェクトにしてください。');return send(200,await referenceLibrary.collect());}
      if(path==='/api/v1/reference-library/observe')return send(200,await referenceLibrary.observe(body));
      if(path==='/api/v1/reference-library/preview'){
        if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['title','brief','visualIntent','design','composition','revision'].includes(key))||typeof body.title!=='string'||body.title.length>120||typeof (body.brief??'')!=='string'||(body.brief??'').length>1000||typeof (body.visualIntent??'')!=='string'||(body.visualIntent??'').length>300||!['auto','photo_focus','editorial','impact','recompose'].includes(body.design??'auto')||!['auto','text_left','text_right','text_top'].includes(body.composition??'auto')||body.revision!==undefined&&typeof body.revision!=='boolean')throw new ApiError(400,'INVALID_INPUT','参考選定の入力を確認してください。');
        const value=await prepareCompleteReferences({...body,referenceMode:'auto'},{store:referenceLibrary,now:referenceClock()});return send(200,{context:value._references.context,candidates:value._references.rows.map(row=>({videoId:row.videoId,url:row.metadata.url,thumbnailSha256:row.asset.sha256,observation:row.observation,imageSent:value._references.context.candidates.find(x=>x.videoId===row.videoId).imageSent})),note:'文章のタグから候補を絞りました。写真との適合と実際の採用は未確認です。生成・OpenAIへの送信は行っていません。'});
      }
      if(path==='/api/v1/validation-a/freeze')return send(200,await freezeValidationA(body,{references:{store:referenceLibrary,now:referenceClock()}}));
      if(path==='/api/v1/complete-thumbnail'){
        const validationA=req.headers['x-validation-a-case']===undefined?null:await checkValidationARequest(body,req.headers['x-validation-a-case'],{references:{store:referenceLibrary,now:referenceClock()}});
        return send(200,{...await complete(body,{references:{store:referenceLibrary,now:referenceClock()},expectedReferenceContext:validationA?.referenceContext}),...(validationA?{validationA}:{})});
      }
      send(200,path==='/api/v1/complete-diagnostics'?analyzePngAssets(body):await runPipeline(body));
    } catch(error) {
      if(!res.headersSent) send(error instanceof ApiError?error.status:500,{error:{code:error instanceof ApiError?error.code:'INTERNAL_ERROR',message:error instanceof ApiError?error.message:'処理に失敗しました。'}});
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=200000;return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  makeServer().listen(Number(process.env.PORT ?? 3000),'127.0.0.1',()=>console.log(`Thumbnail demo: http://127.0.0.1:${process.env.PORT ?? 3000}`));
}


