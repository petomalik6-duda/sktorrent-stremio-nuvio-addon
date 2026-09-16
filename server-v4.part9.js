
// v1.8.2: canonical series grouping and episode-aware metadata matching
function episode(n){
 const s=nodiac(String(n||''));
 let m=s.match(/\bS(\d{1,2})[ ._-]*E(\d{1,3})\b/i);if(m)return{season:+m[1],episode:+m[2]};
 m=s.match(/\b(\d{1,2})x(\d{1,3})\b/i);if(m)return{season:+m[1],episode:+m[2]};
 m=s.match(/\b(?:season|sezona|serie|seria|rada)\s*(\d{1,2})[^0-9]{0,12}(?:episode|epizoda|ep|dil|cast)\s*(\d{1,3})\b/i);if(m)return{season:+m[1],episode:+m[2]};
 m=s.match(/\b(?:epizoda|episode|ep|dil|cast)\s*(\d{1,3})\b/i);return m?{season:null,episode:+m[1]}:{season:null,episode:null}
}
function canonicalSeriesTitle(raw){
 let s=displayTitle(String(raw||''));
 s=s.replace(/\[[^\]]*\]/g,' ')
   .replace(/\([^)]*(?:CZ|SK|EN|dabing|titulk)[^)]*\)/gi,' ')
   .replace(/\bS\d{1,2}[ ._-]*E\d{1,3}\b/gi,' ')
   .replace(/\b\d{1,2}x\d{1,3}\b/gi,' ')
   .replace(/\b(?:season|sezona|serie|seria|s[eé]ria|řada|rada)\s*\d{1,2}\b/gi,' ')
   .replace(/\b\d{1,2}\.?\s*(?:season|sezona|serie|seria|s[eé]ria|řada|rada)\b/gi,' ')
   .replace(/\b(?:episode|epizoda|ep\.?|d[ií]l|cast|část)\s*\d{1,3}\b/gi,' ')
   .replace(/\b(?:2160p|1080p|720p|4k|uhd|hdr10\+?|hdr|dv|hevc|x265|x264|web-?dl|webrip|blu-?ray|bdrip|tvrip|remux|h\.?264|h\.?265|mkv|mp4)\b/gi,' ')
   .replace(/[._]+/g,' ')
   .replace(/\s+/g,' ')
   .replace(/^[\s\-:|/]+|[\s\-:|/]+$/g,'');
 const parts=s.split(/\s+(?:\/|\/\/|\|)\s+/).map(clean).filter(Boolean);
 const cleaned=parts.map(stripSeriesNoise).filter(Boolean).sort((a,b)=>a.length-b.length);
 return cleaned[0]||stripSeriesNoise(s)||clean(s)
}
function metadataQueries(raw,type='movie'){
 const out=[],base=displayTitle(raw),split=base.split(/\s+(?:\/|\/\/|\|)\s+/).map(clean).filter(Boolean);
 if(type==='series'){
  uniqPush(out,canonicalSeriesTitle(base));
  for(const p of split)uniqPush(out,canonicalSeriesTitle(p));
  for(const p of split)uniqPush(out,stripSeriesNoise(p));
  uniqPush(out,stripSeriesNoise(base));
  for(const q of lookupCandidates(base))uniqPush(out,canonicalSeriesTitle(q));
 }else{
  for(const q of lookupCandidates(base))uniqPush(out,q);
  for(const p of split)uniqPush(out,p);
 }
 return out.slice(0,10)
}
async function tmdbSearch(x,type,c,concert=false){
 const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi)return null;
 const cacheKey=`tmdb-match-v3:${type}:${concert?'concert':'normal'}:${nm(x.name)}:${x.year||''}`,old=successfulCacheGet(cacheKey);if(old)return old;
 const t=type==='series'?'tv':'movie',yr=type==='series'?'first_air_date_year':'year';
 for(const q of metadataQueries(x.name,type)){
  for(const useYear of (x.year?[true,false]:[false])){
   try{
    const params={api_key:keyApi,query:q,language:'cs-CZ',include_adult:false};if(useYear)params[yr]=x.year;
    const r=await metadataGet(`https://api.themoviedb.org/3/search/${t}`,{params},`TMDB search ${q}`),hits=r.data?.results||[];
    let h=concert?hits.map(z=>({z,s:concertMatchScore(x,{name:z.title||z.name,releaseInfo:z.release_date||z.first_air_date,poster:z.poster_path})})).filter(v=>v.s>=80).sort((a,b)=>b.s-a.s)[0]?.z:pickMetadataHit(hits,q,useYear?x.year:null,type);
    if(!h)continue;
    let imdb=null;try{const e=await metadataGet(`https://api.themoviedb.org/3/${t}/${h.id}/external_ids`,{params:{api_key:keyApi}},`TMDB external ${h.id}`);imdb=e.data?.imdb_id||null}catch{}
    return successfulCacheSet(cacheKey,{...h,imdb})
   }catch{}
  }
 }
 return null
}
async function catalog(req,res,c){
 c=authConfig(c);const spec=ALL_CATS.find(x=>x.type===req.params.type&&x.id===req.params.id);if(!spec)return res.status(404).json({metas:[]});const ex=extraOf(req.params.extra),sk=ex.skip;
 if(spec.search){
  if(!ex.search)return res.json({metas:[]});
  let raw=spec.concert?await searchConcertItems(ex.search,c,Math.min(20,pages(c))):await searchItems(ex.search,c,Math.min(20,pages(c)));
  if(spec.concert)raw=raw.filter(isConcert);else raw=raw.filter(spec.type==='series'?isSeries:isMovie);
  raw=raw.sort((a,b)=>searchRank(b,ex.search)-searchRank(a,ex.search));
  const batch=raw.slice(sk,sk+100);let metas=await mapLimit(batch,6,x=>resolveMeta(req,x,spec.type,c,Boolean(spec.concert)));
  metas=dedupMetas(metas);
  if(spec.type==='series')metas=metas.filter(m=>/^tt\d+$/.test(m.id)||m.id.startsWith('tmdb:'));
  return res.json({metas:metas.slice(0,PAGE_SIZE)})
 }
 const win=await fullCatalogWindow(spec.id,c,sk,Math.max(PAGE_SIZE*3,120)),concert=spec.id.includes('koncert');let metas=await mapLimit(win.items,6,x=>resolveMeta(req,x,spec.type,c,concert));
 metas=dedupMetas(metas);
 if(spec.type==='series'){
  const before=metas.length;metas=metas.filter(m=>/^tt\d+$/.test(m.id)||m.id.startsWith('tmdb:'));
  log(`series-group ${spec.id} skip=${sk} resolved=${metas.length}/${before}`)
 }
 return res.json({metas:metas.slice(0,PAGE_SIZE)})
}
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.2',name:'SKTorrent Katalógy',description:'SKTorrent katalógy s automatickým zoskupovaním seriálových epizód, odolným párovaním metadát, plným stránkovaním histórie a vlastným prehrávaním.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.2',catalogs:ALL_CATS.length,seriesEpisodeGrouping:true,resilientMetadataMatching:true,metadataRetries:META_HTTP_ATTEMPTS,metadataTimeoutMs:META_HTTP_TIMEOUT,fullCatalogPagination:true,pageSize:PAGE_SIZE,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
