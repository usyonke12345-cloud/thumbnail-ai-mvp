import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
export async function youtubeApiKey(){
 if(process.env.YOUTUBE_API_KEY?.trim())return process.env.YOUTUBE_API_KEY.trim();
 try{return parseEnv(await readFile(new URL('../../.env',import.meta.url),'utf8')).YOUTUBE_API_KEY?.trim()??'';}catch(error){if(error.code==='ENOENT')return '';throw new Error('ローカルのYouTube設定を読めませんでした。');}
}
