import {existsSync} from 'node:fs';
import {referenceStore} from '../backend/references/store.mjs';
import {fileURLToPath} from 'node:url';
import {collectYouTubeReferences,createYouTubeClient,referenceCriteria} from '../backend/references/youtube.mjs';
const root=new URL('../',import.meta.url),envFile=fileURLToPath(new URL('.env',root));if(existsSync(envFile))process.loadEnvFile(envFile);
const folder=new URL('data/private/recent-thumbnail-library/',root),path=new URL('catalog.json',folder);
try{
 if(process.argv.includes('--check')){console.log(JSON.stringify({youtubeKeyConfigured:!!process.env.YOUTUBE_API_KEY?.trim(),catalogExists:existsSync(path),imageGenerationCalls:0}));}
 else if(process.argv.includes('--cache')){const data=await referenceStore.list();let completed=0;for(const row of data.records.filter(x=>x.eligible)){await referenceStore.thumbnail(row.videoId);completed++;if(completed%10===0)console.log(JSON.stringify({stage:'cached',completed,imageGenerationCalls:0}));}}
 else{

  const catalog=await referenceStore.collect(process.argv.includes('--expand')?{queries:['旅行','日常','ルーティン','やってみた','大食い','ドッキリ','料理','筋トレ','美容','購入品','海外','ゲーム']}:{ });
  console.log(JSON.stringify({stage:'saved',count:catalog.records.length,target:catalog.target,complete:catalog.metadataQualified===catalog.target,path:fileURLToPath(path),observed:catalog.records.filter(r=>r.observation).length,imageGenerationCalls:0}));
 }
}catch(error){console.error(error.code??'REFERENCE_COLLECTION_FAILED',error.code?error.message:'収集を完了できませんでした。キーは表示せず、既存の台帳は保持しています。');process.exitCode=1;}
