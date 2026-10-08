import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runPipeline } from './pipeline.mjs';
import { ApiError } from '../shared/contracts.mjs';
import { generationMode } from './generation/index.mjs';
import {generateComplete} from './generation/complete.mjs';
import {generateBackground} from './generation/openai.mjs';
const assets=new Map([['/editor',['editor.html','text/html; charset=utf-8']],['/editor.js',['editor.js','text/javascript; charset=utf-8']],['/editor-layout.js',['editor-layout.js','text/javascript; charset=utf-8']],['/', ['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']],['/references',['references.html','text/html; charset=utf-8']],['/references.js',['references.js','text/javascript; charset=utf-8']]]);
export function makeServer() {
  const server=createServer(async(req,res)=> {
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET' && path==='/api/v1/health') return send(200,{status:'ok',mode:generationMode(),completeGeneration:generateBackground.getStatus()});
      if(req.method==='GET' && assets.has(path)) {
        const [file,mime]=assets.get(path), content=await readFile(new URL(`../frontend/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(content);
      }
      if(!['/api/v1/thumbnails','/api/v1/complete-thumbnail'].includes(path)) return send(404,{error:{code:'NOT_FOUND',message:'ページがありません。'}});
      if(req.method!=='POST') {res.setHeader('Allow','POST');return send(405,{error:{code:'METHOD_NOT_ALLOWED',message:'POSTを使用してください。'}});}
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json') throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','application/jsonを指定してください。');
      let size=0;const chunks=[];
      for await (const chunk of req) {size+=chunk.length;if(size>(path==='/api/v1/complete-thumbnail'?4*1024*1024:16384)) throw new ApiError(413,'BODY_TOO_LARGE','入力が大きすぎます。');chunks.push(chunk);}
      let body;try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch {throw new ApiError(400,'INVALID_JSON','JSONが不正です。');}
      send(200,path==='/api/v1/complete-thumbnail'?await generateComplete(body):await runPipeline(body));
    } catch(error) {
      if(!res.headersSent) send(error instanceof ApiError?error.status:500,{error:{code:error instanceof ApiError?error.code:'INTERNAL_ERROR',message:error instanceof ApiError?error.message:'処理に失敗しました。'}});
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.timeout=200000;return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  makeServer().listen(Number(process.env.PORT ?? 3000),'127.0.0.1',()=>console.log(`Thumbnail demo: http://127.0.0.1:${process.env.PORT ?? 3000}`));
}

