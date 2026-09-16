
// v1.8.1: resilient, fully automatic metadata matching (no manual title mappings)
const META_SUCCESS_TTL=24*60*60*1000;
const META_HTTP_TIMEOUT=9000;
const META_HTTP_ATTEMPTS=3;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function metadataGet(url,config={},label='metadata'){
 let last;
 for(let i=0;i<META_HTTP_ATTEMPTS;i++){
  try{return await axios.get(url,{...config,timeout:Math.max(Number(config.timeout||0),META_HTTP_TIMEOUT)})}
  catch(e){last=e;log(label,`attempt=${i+1}/${META_HTTP_ATTEMPTS}`,e.message);if(i+1<META_HTTP_ATTEMPTS)await sleep(300*(i+1)*(i+1))}
 }
 throw last||Error(`${label} failed`)
}
function successfulCacheGet(key){const h=cache.get(key);return h&&h.e>Date.now()?h.v:null}
function successfulCacheSet(key,value,ttl=META_SUCCESS_TTL){if(value)cache.set(key,{v:value,e:Date.now()+ttl});return value}
function uniqPush(a,v){v=clean(v);if(v&&v.length>1&&!a.some(x=>nm(x)===nm(v)))a.push(v)}
function stripSeriesNoise(s){
 return clean(String(s||'')
  .replace(/\[[^\]]*\]/g,' ')
  .replace(/\((?:CZ|SK|EN|CZ\/EN|SK\/EN|CZ\/SK|SK\/CZ|CZ\/SK\/EN)[^)]*\)/gi,' ')
  .replace(/\b(?:S|Season\s*|Sez[oó]na\s*|S[eé]ria\s*|Serie\s*|Řada\s*|Rada\s*)\d{1,2}(?:\s*(?:E|Episode|Ep\.?)[ ._-]*\d{1,3})?\b/gi,' ')
  .replace(/\b\d{1,2}\.?\s*(?:s[eé]ria|serie|řada|rada|season)\b/gi,' ')
  .replace(/\b(?:s[eé]ria|serie|řada|rada|season)\s*\d{1,2}\b/gi,' ')
  .replace(/\b(?:komplet|complete|collection|pack)\b/gi,' ')
  .replace(/\b(2160p|1080p|720p|4k|uhd|hdr10\+?|hdr|dolby\s*vision|dv|hevc|x265|x264|web-?dl|webrip|blu-?ray|bdrip|tvrip|remux|h\.?264|h\.?265|mkv|mp4)\b/gi,' ')
  .replace(/\s+/g,' ')
  .replace(/^[\s\-:|/]+|[\s\-:|/]+$/g,''))
}
function metadataQueries(raw,type='movie'){
 const out=[];
 const base=displayTitle(raw);
 const split=base.split(/\s+(?:\/|\/\/|\|)\s+/).map(clean).filter(Boolean);
 if(type==='series'){
  for(const p of split)uniqPush(out,stripSeriesNoise(p));
  uniqPush(out,stripSeriesNoise(base));
  for(const q of lookupCandidates(base))uniqPush(out,stripSeriesNoise(q));
 }else{
  for(const q of lookupCandidates(base))uniqPush(out,q);
  for(const p of split)uniqPush(out,p);
 }
 return out.slice(0,8)
}
function metadataHitScore(hit,q,y,type){
 const hn=nm(hit.name||hit.title||hit.original_name||hit.original_title),qn=nm(q);if(!hn||!qn)return-999;
 let s=hn===qn?120:(hn.startsWith(qn)||qn.startsWith(hn)?90:(hn.includes(qn)||qn.includes(hn)?70:0));
 const qw=new Set(qn.split(' ').filter(Boolean)),hw=new Set(hn.split(' ').filter(Boolean)),shared=[...qw].filter(w=>hw.has(w)).length;
 if(qw.size)s+=Math.round(shared/qw.size*35);
 const hy=hitYear(hit)||+String(hit.first_air_date||hit.release_date||'').slice(0,4)||null;
 if(y&&hy)s+=Math.abs(y-hy)<=1?25:(Math.abs(y-hy)<=2?5:-30);
 if(hit.poster||hit.poster_path)s+=5;
 if(type==='series'&&hit.type&&hit.type!=='series')s-=50;
 return s
}
function pickMetadataHit(arr,q,y,type){let best=null,bestScore=-999;for(const h of arr||[]){const s=metadataHitScore(h,q,y,type);if(s>bestScore){best=h;bestScore=s}}return bestScore>=65?best:null}

async function cinemetaSearch(type,q){
 const key=`cine-search-v2:${type}:${nm(q)}`,old=successfulCacheGet(key);if(old)return old;
 try{const r=await metadataGet(`https://v3-cinemeta.strem.io/catalog/${type==='series'?'series':'movie'}/top/search=${encodeURIComponent(q)}.json`,{},`Cinemeta search ${q}`),rows=r.data?.metas||[];return rows.length?successfulCacheSet(key,rows):[]}
 catch{return[]}
}
async function findCinemeta(x,type){
 const key=`cine-match-v2:${type}:${nm(x.name)}:${x.year||''}`,old=successfulCacheGet(key);if(old)return old;
 for(const q of metadataQueries(x.name,type)){const h=pickMetadataHit(await cinemetaSearch(type,q),q,x.year,type);if(h)return successfulCacheSet(key,h)}
 return null
}
async function tmdbSearch(x,type,c,concert=false){
 const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi)return null;
 const cacheKey=`tmdb-match-v2:${type}:${concert?'concert':'normal'}:${nm(x.name)}:${x.year||''}`,old=successfulCacheGet(cacheKey);if(old)return old;
 const t=type==='series'?'tv':'movie',yr=type==='series'?'first_air_date_year':'year';
 for(const q of metadataQueries(x.name,type)){
  try{
   const r=await metadataGet(`https://api.themoviedb.org/3/search/${t}`,{params:{api_key:keyApi,query:q,language:'cs-CZ',include_adult:false,...(x.year?{[yr]:x.year}:{})}},`TMDB search ${q}`),hits=r.data?.results||[];
   let h;
   if(concert)h=hits.map(z=>({z,s:concertMatchScore(x,{name:z.title||z.name,releaseInfo:z.release_date||z.first_air_date,poster:z.poster_path})})).filter(v=>v.s>=80).sort((a,b)=>b.s-a.s)[0]?.z;
   else h=pickMetadataHit(hits,q,x.year,type);
   if(!h)continue;
   let imdb=null;try{const e=await metadataGet(`https://api.themoviedb.org/3/${t}/${h.id}/external_ids`,{params:{api_key:keyApi}},`TMDB external ${h.id}`);imdb=e.data?.imdb_id||null}catch{}
   return successfulCacheSet(cacheKey,{...h,imdb})
  }catch{}
 }
 return null
}
async function cinemetaMeta(type,id){
 const key=`cine-meta-v2:${type}:${id}`,old=successfulCacheGet(key);if(old)return old;
 try{const r=await metadataGet(`https://v3-cinemeta.strem.io/meta/${type}/${id}.json`,{},`Cinemeta meta ${id}`),m=r.data?.meta||null;return m?successfulCacheSet(key,m):null}catch{return null}
}
function tmdbRowToMeta(type,n,z,idOverride=null){const date=z.release_date||z.first_air_date;return{id:idOverride||`tmdb:${n}`,type,name:z.title||z.name,poster:z.poster_path?`https://image.tmdb.org/t/p/w500${z.poster_path}`:undefined,background:z.backdrop_path?`https://image.tmdb.org/t/p/original${z.backdrop_path}`:undefined,description:z.overview,releaseInfo:date?.slice(0,4),imdbRating:z.vote_average?Number(z.vote_average).toFixed(1):undefined,genres:Array.isArray(z.genres)?z.genres.map(g=>g.name).filter(Boolean):undefined}}
async function tmdbMeta(type,id,c){
 const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi)return null;const n=Number(String(id).replace(/^tmdb:/,''));if(!n)return null;
 const ck=`tmdb-meta-v2:${type}:${n}`,old=successfulCacheGet(ck);if(old)return old;
 try{const t=type==='series'?'tv':'movie',r=await metadataGet(`https://api.themoviedb.org/3/${t}/${n}`,{params:{api_key:keyApi,language:'cs-CZ'}},`TMDB meta ${n}`),m=tmdbRowToMeta(type,n,r.data);return successfulCacheSet(ck,m)}catch{return null}
}
async function tmdbMetaByImdb(type,id,c){
 const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi||!/^tt\d+$/.test(id))return null;const ck=`tmdb-imdb-v2:${type}:${id}`,old=successfulCacheGet(ck);if(old)return old;
 try{const r=await metadataGet(`https://api.themoviedb.org/3/find/${id}`,{params:{api_key:keyApi,external_source:'imdb_id',language:'cs-CZ'}},`TMDB find ${id}`),rows=type==='series'?r.data?.tv_results:r.data?.movie_results,z=rows?.[0];if(!z)return null;const m=tmdbRowToMeta(type,z.id,z,id);return successfulCacheSet(ck,m)}catch{return null}
}
async function meta(req,res,c){
 c=authConfig(c);const{id,type}=req.params;
 if(/^tt\d+$/.test(id)){const cine=await cinemetaMeta(type,id);if(cine)return res.json({meta:cine});return res.json({meta:await tmdbMetaByImdb(type,id,c)})}
 if(id.startsWith('tmdb:'))return res.json({meta:await tmdbMeta(type,id,c)});
 if(type==='movie'&&(id.startsWith('skt:')||id.startsWith('sktc:'))){const tid=id.split(':')[1],all=id.startsWith('sktc:')?await recent(c,300,CAT.CONCERTS,20):await recent(c,300,0),x=all.find(v=>v.id===tid);return res.json({meta:x?await resolveMeta(req,x,'movie',c,id.startsWith('sktc:')):null})}
 if(type==='series'&&id.startsWith('sktseries:')){const tid=id.split(':')[1],all=await recent(c,500,CAT.SERIES,Math.min(50,FULL_CATALOG_MAX_PAGES)),x=all.find(v=>v.id===tid);return res.json({meta:x?await resolveMeta(req,x,'series',c,false):null})}
 return res.json({meta:null})
}
