
// v1.9.5: localized TMDB descriptions, preferring Czech, then Slovak, then English
const LOCALIZED_DESCRIPTION_TTL=24*60*60*1000;

async function tmdbLocalizedPayload(type,tmdbId,c){
  const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi)return null;
  const n=Number(tmdbId);if(!n)return null;
  const ck=`tmdb-localized-v195:${type}:${n}`,old=successfulCacheGet(ck);if(old)return old;
  const t=type==='series'?'tv':'movie';
  let base=null,overview='',overviewLanguage=null;
  for(const language of ['cs-CZ','sk-SK','en-US']){
    try{
      const r=await metadataGet(`https://api.themoviedb.org/3/${t}/${n}`,{params:{api_key:keyApi,language}},`TMDB localized ${type} ${n} ${language}`);
      const z=r.data||{};
      if(!base)base=z;
      if(!overview&&String(z.overview||'').trim()){
        overview=String(z.overview).trim();
        overviewLanguage=language;
      }
      if(base&&overview)break;
    }catch(e){log('TMDB localized',type,n,language,e.message)}
  }
  if(!base&&!overview)return null;
  return successfulCacheSet(ck,{base,overview,overviewLanguage},LOCALIZED_DESCRIPTION_TTL)
}

async function tmdbIdForStandard(type,id,c){
  const s=String(id||'');
  if(/^tmdb:\d+/.test(s))return Number((s.match(/^tmdb:(\d+)/)||[])[1])||null;
  if(!/^tt\d+$/.test(s))return null;
  const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi)return null;
  const ck=`tmdb-id-for-standard-v195:${type}:${s}`,old=successfulCacheGet(ck);if(old)return old;
  try{
    const r=await metadataGet(`https://api.themoviedb.org/3/find/${s}`,{params:{api_key:keyApi,external_source:'imdb_id',language:'en-US'}},`TMDB id for ${s}`);
    const rows=type==='series'?r.data?.tv_results:r.data?.movie_results;
    const n=Number(rows?.[0]?.id)||null;
    return n?successfulCacheSet(ck,n,LOCALIZED_DESCRIPTION_TTL):null
  }catch{return null}
}

const _resolveMetaBeforeLocalizedDescription=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
  const m=await _resolveMetaBeforeLocalizedDescription(req,x,type,c,concert);
  if(!m)return m;
  const mid=String(m.id||'');
  if(/^tt\d+$/.test(mid)||/^tmdb:\d+/.test(mid)){
    try{
      const n=await tmdbIdForStandard(type,mid,c);
      if(n){
        const loc=await tmdbLocalizedPayload(type,n,c);
        if(loc?.overview)m.description=loc.overview;
      }
    }catch(e){log('localized resolveMeta',mid,e.message)}
  }
  return m
};

async function tmdbMeta(type,id,c){
  const keyApi=c.tmdbKey||process.env.TMDB_API_KEY;if(!keyApi)return null;
  const n=Number(String(id).replace(/^tmdb:/,'').split(':')[0]);if(!n)return null;
  if(type==='series'){
    const m=await tmdbSeriesMetaWithEpisodes(n,c,`tmdb:${n}`);if(!m)return null;
    const loc=await tmdbLocalizedPayload(type,n,c);
    return loc?.overview?{...m,description:loc.overview}:m
  }
  const loc=await tmdbLocalizedPayload(type,n,c);if(!loc?.base)return null;
  const m=tmdbRowToMeta(type,n,loc.base);
  if(loc.overview)m.description=loc.overview;
  return m
}

async function tmdbMetaByImdb(type,id,c){
  if(!/^tt\d+$/.test(String(id||'')))return null;
  const n=await tmdbIdForStandard(type,id,c);if(!n)return null;
  if(type==='series'){
    const m=await tmdbSeriesMetaWithEpisodes(n,c,id);if(!m)return null;
    const loc=await tmdbLocalizedPayload(type,n,c);
    return loc?.overview?{...m,description:loc.overview}:m
  }
  const loc=await tmdbLocalizedPayload(type,n,c);if(!loc?.base)return null;
  const m=tmdbRowToMeta(type,n,loc.base,id);
  if(loc.overview)m.description=loc.overview;
  return m
}

async function meta(req,res,c){
  c=authConfig(c);const{id,type}=req.params;
  if(type==='series'&&id.startsWith('sktseriesg:')){
    const g=await findSeriesGroupById(id,c);return res.json({meta:g?localSeriesGroupMeta(req,g):null})
  }
  if(/^tt\d+$/.test(id)){
    const tmdb=await tmdbMetaByImdb(type,id,c);if(tmdb)return res.json({meta:tmdb});
    const cine=await cinemetaMeta(type,id);return res.json({meta:cine})
  }
  if(id.startsWith('tmdb:'))return res.json({meta:await tmdbMeta(type,id,c)});
  if(type==='movie'&&(id.startsWith('skt:')||id.startsWith('sktc:'))){
    const tid=id.split(':')[1],all=id.startsWith('sktc:')?await recent(c,300,CAT.CONCERTS,20):await recent(c,300,0),x=all.find(v=>v.id===tid);
    return res.json({meta:x?await resolveMeta(req,x,'movie',c,id.startsWith('sktc:')):null})
  }
  if(type==='series'&&id.startsWith('sktseries:')){
    const tid=id.split(':')[1],all=await recent(c,500,CAT.SERIES,Math.min(50,FULL_CATALOG_MAX_PAGES)),x=all.find(v=>v.id===tid);
    return res.json({meta:x?await resolveMeta(req,x,'series',c,false):null})
  }
  return res.json({meta:null})
}

function manifest(){
  return{
    id:'community.sktorrent.catalogs',version:'1.9.5',name:'SKTorrent Katalógy',
    description:'SKTorrent katalógy s bezpečnými tt/tmdb identitami a lokalizovanými popismi: čeština, potom slovenčina, potom angličtina.',
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
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.9.5',localizedDescriptions:true,descriptionPriority:['cs-CZ','sk-SK','en-US'],safeMovieIdentity:true,referenceMovieIds:true,referenceSeriesIds:true,tmdbSeriesEpisodes:true,nuvioMultiAddonAggregation:true,streamLanguageFlags:true,streamSubtitleInfo:true,at:new Date().toISOString()}));
