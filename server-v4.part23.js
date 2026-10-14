
// v2.0.0: performance layer — persistent catalog index, progressive enrichment,
// request coalescing, negative metadata cache, TMDB-first movie matching and
// parallel stream discovery. Keeps the existing Stremio/Nuvio API contract.
const PERF_V2_META_TIMEOUT=Math.max(3000,Math.min(7000,Number(process.env.META_TIMEOUT_MS||5000)||5000));
const PERF_V2_META_ATTEMPTS=Math.max(1,Math.min(3,Number(process.env.META_ATTEMPTS||2)||2));
const PERF_V2_NEGATIVE_TTL=Math.max(60_000,Number(process.env.NEGATIVE_META_TTL_SECONDS||900)*1000);
const PERF_V2_INDEX_TTL=Math.max(TTL,Number(process.env.CATALOG_INDEX_TTL_SECONDS||900)*1000);
const PERF_V2_ENRICH_CHUNK=Math.max(6,Math.min(24,Number(process.env.ENRICH_CHUNK_SIZE||12)||12));
const perfV2MetaInflight=new Map();
const perfV2NegativeMeta=new Map();
const perfV2CatalogIndexes=new Map();
const perfV2TorrentInflight=new Map();
const perfV2LoginInflight=new Map();

function perfV2StableParams(params={}){return Object.keys(params||{}).sort().map(k=>`${k}=${String(params[k])}`).join('&')}
function perfV2MetaRequestKey(url,config={}){return `${url}?${perfV2StableParams(config.params||{})}`}
function perfV2Retryable(error){const s=Number(error?.response?.status||0);return !s||s===408||s===425||s===429||s>=500}
function perfV2NegativeGet(key){const h=perfV2NegativeMeta.get(key);if(!h)return false;if(h>Date.now())return true;perfV2NegativeMeta.delete(key);return false}
function perfV2NegativeSet(key){perfV2NegativeMeta.set(key,Date.now()+PERF_V2_NEGATIVE_TTL)}
function perfV2KeyFingerprint(value){return crypto.createHash('sha1').update(String(value||'')).digest('hex').slice(0,10)}

// Coalesce identical metadata requests and fail fast on permanent HTTP errors.
metadataGet=async function(url,config={},label='metadata'){
 const key=perfV2MetaRequestKey(url,config);
 if(perfV2MetaInflight.has(key))return perfV2MetaInflight.get(key);
 const task=(async()=>{
  let last;
  for(let i=0;i<PERF_V2_META_ATTEMPTS;i++){
   try{
    const requested=Number(config.timeout||PERF_V2_META_TIMEOUT)||PERF_V2_META_TIMEOUT;
    return await axios.get(url,{...config,timeout:Math.max(2500,Math.min(PERF_V2_META_TIMEOUT,requested))})
   }catch(e){
    last=e;
    const retry=perfV2Retryable(e)&&i+1<PERF_V2_META_ATTEMPTS;
    log(label,`attempt=${i+1}/${PERF_V2_META_ATTEMPTS}`,e.message,retry?'retry':'stop');
    if(!retry)break;
    const retryAfter=Math.min(1500,Math.max(0,Number(e?.response?.headers?.['retry-after']||0)*1000));
    await sleep(retryAfter||250*(i+1)*(i+1))
   }
  }
  throw last||Error(`${label} failed`)
 })();
 perfV2MetaInflight.set(key,task);
 try{return await task}finally{perfV2MetaInflight.delete(key)}
};

// Cache provider misses briefly so the same unmatched title is not searched on every catalog load.
const perfV2FindCinemetaBase=findCinemeta;
findCinemeta=async function(x,type){
 const key=`neg:cine:${type}:${nm(x?.name)}:${x?.year||''}`;
 if(perfV2NegativeGet(key))return null;
 const hit=await perfV2FindCinemetaBase(x,type);
 if(!hit)perfV2NegativeSet(key);
 return hit
};
const perfV2TmdbSearchBase=tmdbSearch;
tmdbSearch=async function(x,type,c,concert=false){
 const apiKey=c?.tmdbKey||process.env.TMDB_API_KEY||'';
 const key=`neg:tmdb:${perfV2KeyFingerprint(apiKey)}:${type}:${concert?'c':'n'}:${nm(x?.name)}:${x?.year||''}`;
 if(perfV2NegativeGet(key))return null;
 const hit=await perfV2TmdbSearchBase(x,type,c,concert);
 if(!hit)perfV2NegativeSet(key);
 return hit
};

// Prevent parallel requests from downloading the same torrent or logging in repeatedly.
const perfV2TorrentDataBase=torrentData;
torrentData=async function(x,c={}){
 const key=`${x?.id||x?.downloadUrl||'unknown'}`;
 if(perfV2TorrentInflight.has(key))return perfV2TorrentInflight.get(key);
 const task=perfV2TorrentDataBase(x,c);
 perfV2TorrentInflight.set(key,task);
 try{return await task}finally{perfV2TorrentInflight.delete(key)}
};
const perfV2SktLoginBase=sktLoginCookie;
sktLoginCookie=async function(c={},force=false){
 const key=`${authFingerprint(c)}:${force?'force':'normal'}`;
 if(perfV2LoginInflight.has(key))return perfV2LoginInflight.get(key);
 const task=perfV2SktLoginBase(c,force);
 perfV2LoginInflight.set(key,task);
 try{return await task}finally{perfV2LoginInflight.delete(key)}
};

function perfV2NewIndex(id){
 return{
  id,createdAt:Date.now(),lastAccess:Date.now(),seen:new Map(),ordered:[],fetchedPages:0,inflight:null,
  states:catalogSourceCategories(id).map(category=>({category,page:0,done:false,tail:Infinity}))
 }
}
function perfV2Index(id){
 let s=perfV2CatalogIndexes.get(id);
 if(!s||Date.now()-s.createdAt>PERF_V2_INDEX_TTL){s=perfV2NewIndex(id);perfV2CatalogIndexes.set(id,s)}
 s.lastAccess=Date.now();return s
}
function perfV2IndexReady(s,need){
 if(s.states.every(v=>v.done))return true;
 if(s.ordered.length<need)return false;
 const threshold=itemTime(s.ordered[Math.min(need-1,s.ordered.length-1)]);
 return s.states.every(v=>v.done||v.tail<=threshold)
}
async function perfV2GrowIndex(s,c,need){
 while(!perfV2IndexReady(s,need)&&s.fetchedPages<FULL_CATALOG_MAX_PAGES){
  const jobs=[];
  for(const st of s.states.filter(v=>!v.done)){
   for(let i=0;i<FULL_CATALOG_FETCH_BATCH&&s.fetchedPages+jobs.length<FULL_CATALOG_MAX_PAGES;i++){
    const page=st.page+i;
    jobs.push({st,page,p:fetchPage(page,c,st.category).then(rows=>({rows})).catch(error=>({rows:[],error}))})
   }
  }
  if(!jobs.length)break;
  const results=await Promise.all(jobs.map(async j=>({...j,...await j.p})));
  for(const r of results.sort((a,b)=>a.page-b.page)){
   const st=r.st;s.fetchedPages++;st.page=Math.max(st.page,r.page+1);
   if(r.error){log('perf-index page',s.id,st.category,r.page,r.error.message);st.done=true;continue}
   const rows=r.rows||[];
   if(rows.length){const times=rows.map(itemTime).filter(Boolean);if(times.length)st.tail=Math.min(st.tail,...times)}
   for(const x of rows){if(s.seen.has(x.id))continue;if(filter(s.id,[x]).length)s.seen.set(x.id,x)}
   if(rows.length<10)st.done=true
  }
  s.ordered=[...s.seen.values()].sort((a,b)=>itemTime(b)-itemTime(a));
 }
}
async function perfV2CatalogWindow(id,c={},skip=0,count=80){
 const s=perfV2Index(id),need=Math.max(1,skip+count);
 while(!perfV2IndexReady(s,need)){
  if(!s.inflight)s.inflight=perfV2GrowIndex(s,c,need).finally(()=>{s.inflight=null});
  await s.inflight;
  if(s.states.every(v=>v.done)||s.fetchedPages>=FULL_CATALOG_MAX_PAGES)break
 }
 return{items:s.ordered.slice(skip,skip+count),matched:s.ordered.length,fetchedPages:s.fetchedPages,exhausted:s.states.every(v=>v.done),sourcePages:s.states.map(v=>({category:v.category,pages:v.page,done:v.done}))}
}

async function perfV2ResolveProgressive(items,limit,concurrency,resolver){
 let metas=[];
 for(let i=0;i<items.length&&metas.length<limit;i+=PERF_V2_ENRICH_CHUNK){
  const chunk=items.slice(i,i+PERF_V2_ENRICH_CHUNK);
  const rows=await mapLimit(chunk,concurrency,resolver);
  metas=dedupMetas([...metas,...rows]);
 }
 return metas.slice(0,limit)
}

// Movie metadata: TMDB first when configured; Cinemeta only as fallback.
// This preserves safe title/year validation and localized descriptions while avoiding duplicate provider work.
const perfV2ResolveMetaBase=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 if(type!=='movie'||concert)return perfV2ResolveMetaBase(req,x,type,c,concert);
 let t=null,cine=null;
 try{t=await tmdbSearch(x,'movie',c,false)}catch(e){log('perf movie tmdb',x?.name,e.message)}
 const tmdbSafe=safeMovieProviderMatch(x,t);
 if(tmdbSafe&&(t?.imdb||t?.id)){
  const standardId=/^tt\d+$/.test(String(t.imdb||''))?t.imdb:`tmdb:${t.id}`;
  const date=t.release_date||t.first_air_date;
  let meta=localMeta(req,x,'movie',false),description=String(t.overview||'').trim();
  if(!description&&t.id){try{const loc=await tmdbLocalizedPayload('movie',t.id,c);description=loc?.overview||''}catch(e){log('perf localized movie',t.id,e.message)}}
  meta={...meta,id:standardId,type:'movie',name:t.title||t.name||meta.name,poster:t.poster_path?`https://image.tmdb.org/t/p/w500${t.poster_path}`:meta.poster,background:t.backdrop_path?`https://image.tmdb.org/t/p/original${t.backdrop_path}`:meta.background,description:description||meta.description,releaseInfo:date?.slice(0,4)||meta.releaseInfo,imdbRating:t.vote_average?Number(t.vote_average).toFixed(1):meta.imdbRating};
  delete meta.videos;delete meta.streams;if(meta.behaviorHints){const bh={...meta.behaviorHints};delete bh.defaultVideoId;if(Object.keys(bh).length)meta.behaviorHints=bh;else delete meta.behaviorHints}
  rememberStandardSourceLink(standardId,x);if(x?.id)rememberDirectVideoSource(x);return meta
 }
 try{cine=await findCinemeta(x,'movie')}catch(e){log('perf movie cine',x?.name,e.message)}
 if(cine&&safeMovieProviderMatch(x,cine)&&/^tt\d+$/.test(String(cine.id||''))){
  let meta=localMeta(req,x,'movie',false),description=cine.description||meta.description;
  try{const n=await tmdbIdForStandard('movie',cine.id,c);if(n&&!cine.description){const loc=await tmdbLocalizedPayload('movie',n,c);if(loc?.overview)description=loc.overview}}catch{}
  meta={...meta,id:cine.id,type:'movie',name:cine.name||cine.title||meta.name,poster:cine.poster||meta.poster,background:cine.background||meta.background,description,releaseInfo:cine.releaseInfo||meta.releaseInfo,imdbRating:cine.imdbRating||meta.imdbRating,genres:cine.genres||meta.genres};
  delete meta.videos;delete meta.streams;if(meta.behaviorHints){const bh={...meta.behaviorHints};delete bh.defaultVideoId;if(Object.keys(bh).length)meta.behaviorHints=bh;else delete meta.behaviorHints}
  rememberStandardSourceLink(cine.id,x);if(x?.id)rememberDirectVideoSource(x);return meta
 }
 log(`perf movie no-standard-id source=${x?.name||'-'}`);return null
};

// Resolve only as many metadata rows as are needed to fill the visible page.
catalog=async function(req,res,c){
 c=authConfig(c);const spec=ALL_CATS.find(x=>x.type===req.params.type&&x.id===req.params.id);if(!spec)return res.status(404).json({metas:[]});
 const ex=extraOf(req.params.extra),sk=ex.skip;
 if(spec.search){
  if(!ex.search)return res.json({metas:[]});
  let raw=spec.concert?await searchConcertItems(ex.search,c,Math.min(20,pages(c))):await searchItems(ex.search,c,Math.min(20,pages(c)));
  if(spec.concert)raw=raw.filter(isConcert);else raw=raw.filter(spec.type==='series'?isSeries:isMovie);
  raw=raw.sort((a,b)=>searchRank(b,ex.search)-searchRank(a,ex.search));
  if(spec.type==='series'){
   const groups=groupSeriesItems(raw).slice(sk,sk+PAGE_SIZE*2);
   const metas=await perfV2ResolveProgressive(groups,PAGE_SIZE,4,g=>resolveSeriesGroup(req,g,c));
   return res.json({metas})
  }
  const rows=raw.slice(sk,sk+PAGE_SIZE*3);
  const metas=await perfV2ResolveProgressive(rows,PAGE_SIZE,6,x=>resolveMeta(req,x,spec.type,c,Boolean(spec.concert)));
  return res.json({metas})
 }
 const sourceCount=spec.type==='series'?PAGE_SIZE*5:PAGE_SIZE*3;
 const win=await perfV2CatalogWindow(spec.id,c,sk,sourceCount),concert=spec.id.includes('koncert');
 if(spec.type==='series'){
  const groups=groupSeriesItems(win.items);
  const metas=await perfV2ResolveProgressive(groups,PAGE_SIZE,4,g=>resolveSeriesGroup(req,g,c));
  log(`catalog-v2 ${spec.id} skip=${sk} source=${win.items.length} groups=${groups.length} metas=${metas.length} pages=${win.fetchedPages}`);
  return res.json({metas})
 }
 const metas=await perfV2ResolveProgressive(win.items,PAGE_SIZE,6,x=>resolveMeta(req,x,spec.type,c,concert));
 log(`catalog-v2 ${spec.id} skip=${sk} source=${win.items.length} metas=${metas.length} pages=${win.fetchedPages}`);
 return res.json({metas})
};

// Parallelize independent source searches and limit concurrent torrent parsing/downloads.
streamsForStandard=async function(type,id,c){
 c=authConfig(c);const bits=String(id||'').split(':'),sp=type==='series'?standardSeriesIdParts(id):null,base=sp?.base||standardStreamBase(id),season=sp?.season||null,ep=sp?.episode||null;
 const target=await targetFromStandard(type,base,c),linked=getStandardSourceLink(base),ranked=[];
 if(linked)ranked.push({x:linked,s:10000,kind:'linked'});
 if(target){
  const queries=fallbackSourceQueries(target,type);
  const batches=await Promise.all(queries.map(q=>searchItems(q,c,4).catch(e=>{log('perf source search',q,e.message);return[]})));
  const all=batches.flat();
  for(const x of [...new Map(all.map(v=>[v.id,v])).values()]){const s=safeSourceCandidate(x,target,type,season,ep);if(s>=55)ranked.push({x,s,kind:'search'})}
  if(type==='movie'){try{ranked.push(...await concertCandidatesForStandard(target,base,c))}catch(e){log('perf concert candidates',e.message)}}
 }
 const unique=[...new Map(ranked.sort((a,b)=>b.s-a.s).map(z=>[z.x.id,z])).values()].slice(0,10);
 const streams=await mapLimit(unique.slice(0,6),3,async z=>{try{return await streamFromSktSource(z.x,type,base,season,ep,c)}catch(e){log(`torrent ${z.kind}`,z.x.name,e.message);return null}});
 const dedup=[...new Map(streams.filter(Boolean).map(s=>[`${s.infoHash||''}:${s.fileIdx??''}`,s])).values()];
 log(`streams-v2 ${base} linked=${Boolean(linked)} candidates=${unique.length} streams=${dedup.length}`);return dedup
};

manifest=function(){
 return{
  id:'community.sktorrent.catalogs',version:'2.0.0',name:'SKTorrent Katalógy',
  description:'SKTorrent Katalógy v2.0: rýchlejší katalógový index, progresívne metadata, TMDB-first matching, request coalescing a paralelné vyhľadávanie streamov.',
  resources:[
   {name:'catalog',types:['movie','series']},
   {name:'meta',types:['movie'],idPrefixes:['tt','tmdb:']},
   {name:'meta',types:['series'],idPrefixes:['tt','tmdb:','sktseriesg:']},
   {name:'stream',types:['movie'],idPrefixes:['tt','tmdb:']},
   {name:'stream',types:['series'],idPrefixes:['tt','tmdb:','sktseriesg:']}
  ],
  types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),
  idPrefixes:['tt','tmdb:','sktseriesg:'],behaviorHints:{configurable:true,configurationRequired:false}
 }
};
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'2.0.0',performanceV2:true,catalogIndex:true,catalogIndexTtlMs:PERF_V2_INDEX_TTL,progressiveMetadata:true,enrichChunk:PERF_V2_ENRICH_CHUNK,metadataTimeoutMs:PERF_V2_META_TIMEOUT,metadataAttempts:PERF_V2_META_ATTEMPTS,negativeMetadataCache:true,negativeMetadataTtlMs:PERF_V2_NEGATIVE_TTL,inflightDedup:true,tmdbFirstMovies:true,parallelStreamSearch:true,pageSize:PAGE_SIZE,at:new Date().toISOString()}));
