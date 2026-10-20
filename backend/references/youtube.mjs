import {ApiError} from '../../shared/contracts.mjs';
export const DEFAULT_REFERENCE_QUERIES=Object.freeze(['旅行','日常','ルーティン','やってみた','大食い','ドッキリ','料理','筋トレ','美容','購入品','海外','ゲーム']);
export function referenceCriteria(now=new Date()){
 const end=new Date(now),start=new Date(now),day=start.getUTCDate();start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-6);const last=new Date(start);last.setUTCMonth(last.getUTCMonth()+1,0);start.setUTCDate(Math.min(day,last.getUTCDate()));
 return {publishedAfter:start.toISOString(),publishedBefore:end.toISOString(),minViewsExclusive:1000000,minDurationSeconds:240,target:100,maxPerChannel:5,regionCode:'JP',relevanceLanguage:'ja'};
}
export function durationSeconds(value){
 const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value??'');return m?Number(m[1]??0)*3600+Number(m[2]??0)*60+Number(m[3]??0):null;
}
export function thumbnailUrl(value,videoId){
 let url;try{url=new URL(value);}catch{throw new Error('Invalid thumbnail URL.');}
 if(url.protocol!=='https:'||!['i.ytimg.com','i9.ytimg.com'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash||!url.pathname.startsWith('/vi/'+videoId+'/')||!/^\/vi\/[A-Za-z0-9_-]{11}\/[A-Za-z0-9_-]+\.jpg$/.test(url.pathname))throw new Error('Unsupported thumbnail URL.');return url.href;
}
export function normalizeYouTubeVideo(item,checkedAt){
 if(!/^[A-Za-z0-9_-]{11}$/.test(item?.id??''))return null;
 const s=item.snippet,views=item.statistics?.viewCount,duration=durationSeconds(item.contentDetails?.duration);
 if(!s||typeof s.title!=='string'||!s.title.trim()||s.title.length>500||!/^UC[A-Za-z0-9_-]{22}$/.test(s.channelId??'')||!Number.isFinite(Date.parse(s.publishedAt))||!/^\d{1,30}$/.test(views??'')||!Number.isFinite(duration)||s.liveBroadcastContent!=='none'||item.liveStreamingDetails)return null;
 const thumb=['maxres','standard','high','medium'].map(key=>s.thumbnails?.[key]).find(value=>value?.url);if(!thumb)return null;
 let imageUrl;try{imageUrl=thumbnailUrl(thumb.url,item.id);}catch{return null;}
 return {videoId:item.id,url:'https://www.youtube.com/watch?v='+item.id,title:s.title,channelId:s.channelId,channelTitle:String(s.channelTitle??'').slice(0,200),publishedAt:s.publishedAt,viewCount:views,durationSeconds:duration,thumbnailUrl:imageUrl,checkedAt,verification:'youtube_data_api',language:s.defaultAudioLanguage??s.defaultLanguage??null};
}
export function qualifiesReference(record,criteria){
 return record?.verification==='youtube_data_api'&&Number.isFinite(Date.parse(record.checkedAt))&&Number.isFinite(Date.parse(record.publishedAt))&&Date.parse(record.publishedAt)>=Date.parse(criteria.publishedAfter)&&Date.parse(record.publishedAt)<=Date.parse(criteria.publishedBefore)&&/^\d{1,30}$/.test(record.viewCount??'')&&BigInt(record.viewCount)>BigInt(criteria.minViewsExclusive)&&record.durationSeconds>=criteria.minDurationSeconds;
}
export function createYouTubeClient({apiKey=process.env.YOUTUBE_API_KEY,fetchImpl=globalThis.fetch}={}){
 async function request(endpoint,parameters){
  if(typeof apiKey!=='string'||!apiKey.trim())throw new ApiError(503,'YOUTUBE_KEY_MISSING','YouTube Data APIキーをPC内の.envへ設定してください。OpenAIキーとは別です。');
  const url=new URL('https://www.googleapis.com/youtube/v3/'+endpoint);for(const [key,value]of Object.entries(parameters))url.searchParams.set(key,String(value));
  let response;try{response=await fetchImpl(url,{headers:{'X-Goog-Api-Key':apiKey.trim()},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new ApiError(502,'YOUTUBE_NETWORK','YouTubeへ接続できませんでした。収集済みの記録は保持します。');}
  if(!response.ok){await response.body?.cancel();throw new ApiError(response.status===429?429:502,'YOUTUBE_API_ERROR',response.status===403?'YouTube Data APIの有効化・キーのAPI制限・クォータを確認してください。':'YouTubeの取得に失敗しました。収集済みの記録は保持します。');}
  const chunks=[];let length=0;try{for await(const chunk of response.body){length+=chunk.length;if(length>3*1024*1024)throw new ApiError(502,'YOUTUBE_RESPONSE','YouTubeの応答が大きすぎます。');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(502,'YOUTUBE_RESPONSE','YouTubeの応答形式を確認できませんでした。');}
 }
 return {
  search:(q,criteria,pageToken)=>request('search',{part:'id',type:'video',q,order:'viewCount',publishedAfter:criteria.publishedAfter,publishedBefore:criteria.publishedBefore,maxResults:50,regionCode:criteria.regionCode,relevanceLanguage:criteria.relevanceLanguage,...(pageToken?{pageToken}:{})}),
  videos:ids=>request('videos',{part:'snippet,statistics,contentDetails,liveStreamingDetails',id:ids.join(',')})
 };
}
export async function collectYouTubeReferences({client=createYouTubeClient(),criteria=referenceCriteria(),queries=DEFAULT_REFERENCE_QUERIES,maxSearchCalls=24,existingMetadata=[],onProgress=()=>{},now=()=>new Date().toISOString()}={}){
 if(!Number.isInteger(maxSearchCalls)||maxSearchCalls<1||maxSearchCalls>40||!Array.isArray(queries)||queries.length<1||queries.length>12||queries.some(q=>typeof q!=='string'||!q.trim()||[...q].length>100))throw new Error('Invalid collection limits.');
 const known=new Set(),records=new Map(),tokens=new Map(),done=new Set();let searchCalls=0,detailCalls=0;
 const previous=new Map(existingMetadata.filter(row=>/^[A-Za-z0-9_-]{11}$/.test(row?.videoId??'')).map(row=>[row.videoId,row]));
 if(previous.size>500)throw new Error('Too many existing references.');
 const oldIds=[...previous.keys()];for(let offset=0;offset<oldIds.length;offset+=50){const details=await client.videos(oldIds.slice(offset,offset+50));detailCalls++;for(const item of details.items??[]){const record=normalizeYouTubeVideo(item,now());if(record&&qualifiesReference(record,criteria)){records.set(record.videoId,{...record,discoveryQueries:previous.get(record.videoId)?.discoveryQueries??['previous_collection']});known.add(record.videoId);}}}
 for(let round=0;round<5&&searchCalls<maxSearchCalls;round++){
  for(const query of queries){
   if(done.has(query)||searchCalls>=maxSearchCalls)continue;
   const result=await client.search(query,criteria,tokens.get(query));searchCalls++;
   const ids=[...new Set((result.items??[]).slice(0,50).map(item=>item.id?.videoId).filter(id=>/^[A-Za-z0-9_-]{11}$/.test(id??'')&&!known.has(id)))];ids.forEach(id=>known.add(id));
   for(let offset=0;offset<ids.length;offset+=50){const details=await client.videos(ids.slice(offset,offset+50));detailCalls++;const checkedAt=now();for(const item of details.items??[]){const record=normalizeYouTubeVideo(item,checkedAt);if(record&&qualifiesReference(record,criteria))records.set(record.videoId,{...record,discoveryQueries:[...new Set([...(records.get(record.videoId)?.discoveryQueries??[]),query])]});}}
   if(typeof result.nextPageToken==='string'&&result.nextPageToken!==tokens.get(query))tokens.set(query,result.nextPageToken);else done.add(query);
   onProgress({searchCalls,detailCalls,candidatesSeen:known.size,qualified:records.size});
  }
  const channels=new Map();let usable=0;for(const row of records.values()){const count=channels.get(row.channelId)??0;if(count<criteria.maxPerChannel){channels.set(row.channelId,count+1);usable++;}}
  if(usable>=criteria.target||done.size===queries.length)break;
 }
 // Round-robin by discovery query prevents the first query monopolizing the bank.
 const selectionQueries=[...new Set([...queries,...[...records.values()].flatMap(row=>row.discoveryQueries)])];
 const selected=[],selectedIds=new Set(),channelCounts=new Map(),sorted=[...records.values()].sort((a,b)=>BigInt(a.viewCount)>BigInt(b.viewCount)?-1:BigInt(a.viewCount)<BigInt(b.viewCount)?1:a.videoId.localeCompare(b.videoId));
 let changed=true;while(selected.length<criteria.target&&changed){changed=false;for(const query of selectionQueries){const row=sorted.find(r=>r.discoveryQueries.includes(query)&&!selectedIds.has(r.videoId)&&(channelCounts.get(r.channelId)??0)<criteria.maxPerChannel);if(!row)continue;selected.push(row);selectedIds.add(row.videoId);channelCounts.set(row.channelId,(channelCounts.get(row.channelId)??0)+1);changed=true;if(selected.length>=criteria.target)break;}}
 return {version:'thumbnail-reference-catalog-1.0.0',criteria,collectedAt:now(),collection:{searchCalls,detailCalls,candidatesSeen:known.size,qualifiedCandidates:records.size,complete:selected.length===criteria.target},records:selected.map(metadata=>({videoId:metadata.videoId,metadata,observation:null,asset:null,imageUse:{generationAllowed:false,basis:null}}))};
}
