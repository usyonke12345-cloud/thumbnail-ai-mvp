import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import net from 'node:net';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined;};
const envPath=resolve(root,value('--config-file')??'.env');
try{
 if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22以上が必要です。');
 if(existsSync(envPath)){try{process.loadEnvFile(envPath);}catch{throw new Error('ローカル設定ファイルを読み込めません。書式を確認してください。');}}
 const port=Number(value('--port')??process.env.PORT??3004);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('ポートは1〜65535で指定してください。');
 const maxCalls=Number(process.env.OPENAI_MAX_CALLS??1),timeout=Number(process.env.OPENAI_TIMEOUT_MS??120000);if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>100||!Number.isInteger(timeout)||timeout<1000||timeout>180000)throw new Error('生成回数・待機期限の設定を確認してください。');
 try{createRequire(import.meta.url).resolve('fontkit');}catch{throw new Error('依存パッケージがありません。プロジェクトのフォルダーで npm ci を実行してください。');}
 if(args.includes('--free')){process.env.GENERATION_PROVIDER='mock';process.env.OPENAI_IMAGE_ENABLED='false';}
 process.env.PORT=String(port);process.env.OPENAI_MAX_CALLS=String(maxCalls);
 const busy=await new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port});socket.setTimeout(1000);socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(false);});});
 let existing=false,live=null;if(busy){try{const response=await fetch(`http://127.0.0.1:${port}/api/v1/health`,{signal:AbortSignal.timeout(2000)}),health=await response.json();existing=health.status==='ok'&&['demo','ai_background'].includes(health.mode)&&typeof health.completeGeneration?.maxCalls==='number';if(existing)live=health.completeGeneration;}catch{}}
 const status={node:process.versions.node,dependenciesReady:true,envFilePresent:existsSync(envPath),keyConfigured:live?.keyConfigured??!!process.env.OPENAI_API_KEY?.trim(),paidGenerationEnabled:live?.enabled??(process.env.OPENAI_IMAGE_ENABLED==='true'),maxCalls:live?.maxCalls??maxCalls,calls:live?.calls??0,port,portBusy:busy,existingThumbnailServer:existing,url:`http://127.0.0.1:${port}/editor`};
 if(args.includes('--check')){console.log(JSON.stringify(status,null,2));if(busy&&!existing)process.exitCode=1;}
 else if(busy){if(!existing)throw new Error(`ポート${port}は別のアプリが使用しています。--port 3005 などを指定してください。既存プロセスは停止しません。`);if(args.includes('--free')&&status.paidGenerationEnabled)throw new Error('既存サーバーは有料生成が有効です。無料モードに変更するには、手動で終了してから --free で起動してください。');console.log(`既に起動しています。生成回数はリセットしません。\n${status.url}`);}
 else{const {makeServer}=await import('../backend/server.mjs');const server=makeServer();server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'起動直前にポートが使用されました。別ポートを指定してください。':'ローカルサーバーを起動できませんでした。');process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`起動しました。\n${status.url}\n${status.paidGenerationEnabled?'有料生成は手動確認が必要です。新しい起動の生成回数上限：'+maxCalls+'回。':'無料モードです。'}\n終了：Ctrl+C`));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));}
}catch(error){console.error(error.message);process.exitCode=1;}
