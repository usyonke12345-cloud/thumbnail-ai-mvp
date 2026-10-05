import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runPipeline } from './pipeline.mjs';
import { ApiError } from '../shared/contracts.mjs';
const assets=new Map([['/', ['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
export function makeServer() {
  const server=createServer(async(req,res)=> {
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(req.method==='GET' && path==='/api/v1/health') return send(200,{status:'ok',mode:'demo'});
      if(req.method==='GET' && assets.has(path)) {
        const [file,mime]=assets.get(path), content=await readFile(new URL(`../frontend/${file}`,import.meta.url));
        res.writeHead(200,{'Content-Type':mime,'X-Content-Type-Options':'nosniff'});return res.end(content);
      }
      if(path!=='/api/v1/thumbnails') return send(404,{error:{code:'NOT_FOUND',message:'ページがありません。'}});
      if(req.method!=='POST') {res.setHeader('Allow','POST');return send(405,{error:{code:'METHOD_NOT_ALLOWED',message:'POSTを使用してください。'}});}
      if(req.headers['content-type']?.split(';')[0].trim()!=='application/json') throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','application/jsonを指定してください。');
      let size=0;const chunks=[];
      for await (const chunk of req) {size+=chunk.length;if(size>16384) throw new ApiError(413,'BODY_TOO_LARGE','入力が大きすぎます。');chunks.push(chunk);}
      let body;try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch {throw new ApiError(400,'INVALID_JSON','JSONが不正です。');}
      send(200,await runPipeline(body));
    } catch(error) {
      if(!res.headersSent) send(error instanceof ApiError?error.status:500,{error:{code:error instanceof ApiError?error.code:'INTERNAL_ERROR',message:error instanceof ApiError?error.message:'処理に失敗しました。'}});
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;return server;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  makeServer().listen(Number(process.env.PORT ?? 3000),'127.0.0.1',()=>console.log(`Thumbnail demo: http://127.0.0.1:${process.env.PORT ?? 3000}`));
}
