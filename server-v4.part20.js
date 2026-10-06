
// v1.9.3: TMDB series details with standard episode video IDs
const TMDB_SERIES_EPISODES_TTL=24*60*60*1000;

async function tmdbSeriesMetaWithEpisodes(tmdbId,c,idOverride=null){
 const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi)return null;
 const n=Number(tmdbId);if(!n)return null;
 const ck=`tmdb-series-episodes-v3:${n}:${idOverride||''}`,old=successfulCacheGet(ck);if(old)return old;
 try{
  const r=await metadataGet(`https://api.themoviedb.org/3/tv/${n}`,{params:{api_key:keyApi,language:'cs-CZ'}},`TMDB series meta ${n}`),z=r.data||{};
  const baseId=idOverride||`tmdb:${n}`;
  const m=tmdbRowToMeta('series',n,z,baseId);
  const seasons=(Array.isArray(z.seasons)?z.seasons:[])
   .filter(s=>Number.isFinite(Number(s.season_number))&&Number(s.season_number)>=0&&Number(s.episode_count||0)>0)
   .sort((a,b)=>Number(a.season_number)-Number(b.season_number));
  const rows=await mapLimit(seasons,4,async s=>{
   const sn=Number(s.season_number);
   try{
    const sr=await metadataGet(`https://api.themoviedb.org/3/tv/${n}/season/${sn}`,{params:{api_key:keyApi,language:'cs-CZ'}},`TMDB season ${n}/${sn}`);
    return Array.isArray(sr.data?.episodes)?sr.data.episodes.map(e=>({
      id:`${baseId}:${sn}:${Number(e.episode_number)}`,
      title:e.name||`S${String(sn).padStart(2,'0')}E${String(Number(e.episode_number)).padStart(2,'0')}`,
      season:sn,
      episode:Number(e.episode_number),
      released:e.air_date?`${e.air_date}T00:00:00.000Z`:undefined,
      overview:e.overview||undefined,
      thumbnail:e.still_path?`https://image.tmdb.org/t/p/w500${e.still_path}`:undefined
    })).filter(v=>Number.isFinite(v.episode)&&v.episode>0):[];
   }catch(e){log('TMDB season episodes',`${n}/${sn}`,e.message);return[]}
  });
  m.videos=rows.flat().sort((a,b)=>a.season-b.season||a.episode-b.episode);
  return successfulCacheSet(ck,m,TMDB_SERIES_EPISODES_TTL)
 }catch(e){log('TMDB series detail',n,e.message);return null}
}

async function tmdbMeta(type,id,c){
 const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi)return null;
 const n=Number(String(id).replace(/^tmdb:/,'').split(':')[0]);if(!n)return null;
 if(type==='series')return tmdbSeriesMetaWithEpisodes(n,c,`tmdb:${n}`);
 const ck=`tmdb-meta-v3:${type}:${n}`,old=successfulCacheGet(ck);if(old)return old;
 try{const r=await metadataGet(`https://api.themoviedb.org/3/movie/${n}`,{params:{api_key:keyApi,language:'cs-CZ'}},`TMDB meta ${n}`),m=tmdbRowToMeta(type,n,r.data);return successfulCacheSet(ck,m)}catch{return null}
}

async function tmdbMetaByImdb(type,id,c){
 const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi||!/^tt\d+$/.test(id))return null;
 const ck=`tmdb-imdb-v3:${type}:${id}`,old=successfulCacheGet(ck);if(old)return old;
 try{
  const r=await metadataGet(`https://api.themoviedb.org/3/find/${id}`,{params:{api_key:keyApi,external_source:'imdb_id',language:'cs-CZ'}},`TMDB find ${id}`),rows=type==='series'?r.data?.tv_results:r.data?.movie_results,z=rows?.[0];if(!z)return null;
  if(type==='series'){
   const m=await tmdbSeriesMetaWithEpisodes(z.id,c,id);return m?successfulCacheSet(ck,m):null
  }
  const m=tmdbRowToMeta(type,z.id,z,id);return successfulCacheSet(ck,m)
 }catch{return null}
}

function manifest(){
 return{
  id:'community.sktorrent.catalogs',version:'1.9.3',name:'SKTorrent Katalógy',
  description:'SKTorrent katalógy s referenčným tt/tmdb modelom pre filmy a seriály; TMDB seriály majú štandardné episode video IDs, takže Nuvio zobrazí epizódy a agreguje kompatibilné stream addony.',
  resources:[
   {name:'catalog',types:['movie','series']},
   {name:'meta',types:['movie'],idPrefixes:['tt','tmdb:']},
   {name:'meta',types:['series'],idPrefixes:['tt','tmdb:','sktseriesg:']},
   {name:'stream',types:['movie'],idPrefixes:['tt','tmdb:']},
   {name:'stream',types:['series'],idPrefixes:['tt','tmdb:','sktseriesg:']}
  ],
  types:['movie','series'],
  catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),
  idPrefixes:['tt','tmdb:','sktseriesg:'],behaviorHints:{configurable:true,configurationRequired:false}
 }
}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.9.3',referenceMovieIds:true,referenceSeriesIds:true,tmdbSeriesEpisodes:true,standardEpisodeVideoIds:true,tmdbEpisodeIds:true,seriesEpisodeGrouping:true,localSeriesFallback:true,nuvioMultiAddonAggregation:true,streamLanguageFlags:true,streamSubtitleInfo:true,fullCatalogPagination:true,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
