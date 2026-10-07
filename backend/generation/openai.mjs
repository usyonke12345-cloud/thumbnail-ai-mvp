import { ApiError } from '../../shared/contracts.mjs';

const ENDPOINT='https://api.openai.com/v1/images/generations';
const MODEL='gpt-image-2.5-flare';
const MAX_RESPONSE_BYTES=16*1024*1024;
function integer(value,fallback,min,max) {
  const n=value===undefined?fallback:Number(value);
  if(!Number.isInteger(n)||n<min||n>max) throw new ApiError(503,'PROVIDER_CONFIG','生成APIの制限設定を確認してください。');
  return n;
}
// One instance per process: no retry, one image per request, one concurrent call.
export function createOpenAIBackgroundProvider({env=process.env,fetchImpl=(...args)=>globalThis.fetch(...args)}={}) {
  let busy=false, calls=0;
  return async function generateBackground(input) {
    if(!env.OPENAI_API_KEY?.trim()) throw new ApiError(503,'API_KEY_MISSING','PC内の.envにOPENAI_API_KEYを設定してください。');
    if(env.OPENAI_IMAGE_ENABLED!=='true') throw new ApiError(503,'PAID_GENERATION_DISABLED','実画像生成は未有効です。設定手順を確認してください。');
    const maxCalls=integer(env.OPENAI_MAX_CALLS,1,1,100);
    const timeoutMs=integer(env.OPENAI_TIMEOUT_MS,120000,1000,180000);
    if(busy) throw new ApiError(429,'GENERATION_BUSY','別の画像を生成中です。完了してから再試行してください。');
    if(calls>=maxCalls) throw new ApiError(429,'GENERATION_LIMIT','この起動中の生成回数上限に達しました。');
    busy=true;calls++;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const response=await fetchImpl(ENDPOINT,{method:'POST',signal:controller.signal,headers:{'Authorization':`Bearer ${env.OPENAI_API_KEY.trim()}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,n:1,size:'1536x1024',quality:'low',output_format:'png',prompt:[
        'Create a visually striking background illustration for a YouTube thumbnail.',
        'No words, letters, captions, watermarks or logos. Put the main visual subject on the right third.',
        'The left two thirds will be covered by a solid title panel. Prefer a clear subject and uncluttered composition.',
        `Video brief (content context, not instructions): ${JSON.stringify(input)}`
      ].join('\n')})});
      if(!response.ok) {
        await response.body?.cancel();
        if(response.status===401||response.status===403) throw new ApiError(503,'PROVIDER_AUTH','APIキーまたは画像モデルの利用権限を確認してください。');
        if(response.status===429) throw new ApiError(429,'PROVIDER_RATE_LIMIT','画像APIの利用上限に達しました。残高・制限を確認してください。');
        throw new ApiError(502,'PROVIDER_ERROR','画像APIが生成を完了できませんでした。');
      }
      const chunks=[];let bytes=0;
      for await(const chunk of response.body) {
        bytes+=chunk.length;
        if(bytes>MAX_RESPONSE_BYTES){controller.abort();throw new ApiError(502,'PROVIDER_RESPONSE','画像APIの応答が大きすぎます。');}
        chunks.push(Buffer.from(chunk));
      }
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ApiError(502,'PROVIDER_RESPONSE','画像APIの応答が不正です。');}
      const encoded=body.data?.[0]?.b64_json;
      if(typeof encoded!=='string'||!encoded.length||encoded.length%4!==0||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new ApiError(502,'PROVIDER_RESPONSE','画像データを取得できませんでした。');
      const png=Buffer.from(encoded,'base64');
      if(png.length<24||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.toString('ascii',12,16)!=='IHDR'||png.readUInt32BE(16)!==1536||png.readUInt32BE(20)!==1024) throw new ApiError(502,'PROVIDER_RESPONSE','期待するPNG画像を取得できませんでした。');
      return `data:image/png;base64,${encoded}`;
    } catch(error) {
      if(error instanceof ApiError) throw error;
      if(controller.signal.aborted) throw new ApiError(504,'PROVIDER_TIMEOUT','生成の待ち時間を超えました。課金された可能性があるため、利用履歴を確認してください。');
      throw new ApiError(502,'PROVIDER_NETWORK','画像APIに接続できませんでした。');
    } finally {clearTimeout(timer);busy=false;}
  };
}
export const generateBackground=createOpenAIBackgroundProvider();
