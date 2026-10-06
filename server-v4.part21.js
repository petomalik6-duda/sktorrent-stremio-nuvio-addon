
// v1.9.4: validate movie provider identity against the original SKTorrent title/year before assigning tt/tmdb IDs
function movieProviderYear(hit){
  return hitYear(hit) || +String(hit?.release_date || hit?.first_air_date || hit?.releaseInfo || hit?.year || '').slice(0,4) || null;
}

function movieProviderNames(hit){
  return [hit?.name,hit?.title,hit?.original_name,hit?.original_title]
    .map(v=>nm(v))
    .filter(Boolean);
}

function movieMatchWords(value){
  const stop=new Set(['film','movie','the','and','of','in','at','a','an','cz','sk','en']);
  return [...new Set(nm(value).split(' ').filter(w=>w.length>1&&!stop.has(w)&&!/^(19|20)\d{2}$/.test(w)))];
}

function safeMovieProviderMatch(x,hit){
  if(!x||!hit)return false;
  const srcTitle=canonicalMovieMetadataTitle(x.name);
  const src=nm(srcTitle);
  if(!src)return false;
  const sy=x.year||yearFrom(x.name)||null;
  const hy=movieProviderYear(hit);
  if(sy&&hy&&Math.abs(sy-hy)>1)return false;

  const sw=movieMatchWords(srcTitle);
  if(!sw.length)return false;
  const names=movieProviderNames(hit);
  for(const cand of names){
    if(cand===src)return true;
    if(cand.startsWith(src)||src.startsWith(cand)){
      if(!sy||!hy||Math.abs(sy-hy)<=1)return true;
    }
    const cw=new Set(movieMatchWords(cand));
    const shared=sw.filter(w=>cw.has(w));
    const coverage=shared.length/sw.length;
    const hasStrongShared=shared.some(w=>w.length>=5);

    // With a known compatible year, allow localized grammatical variants such as
    // "Dvaja prokurátori" vs "Dva prokurátoři", but never a zero-overlap title.
    if(sy&&hy&&Math.abs(sy-hy)<=1){
      if(sw.length===1&&shared.length===1)return true;
      if(sw.length===2&&shared.length>=1&&hasStrongShared)return true;
      if(sw.length>=3&&(shared.length>=2||coverage>=0.66))return true;
    }else{
      if(sw.length===1&&shared.length===1)return true;
      if(sw.length===2&&shared.length===2)return true;
      if(sw.length>=3&&shared.length>=2&&coverage>=0.66)return true;
    }
  }
  return false;
}

const _resolveMetaBeforeSafeMovieIdentity=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
  if(type!=='movie'||concert)return _resolveMetaBeforeSafeMovieIdentity(req,x,type,c,concert);

  let cine=null,t=null;
  try{cine=await findCinemeta(x,'movie')}catch(e){log('safe movie cine',x?.name,e.message)}
  try{t=await tmdbSearch(x,'movie',c,false)}catch(e){log('safe movie tmdb',x?.name,e.message)}

  const cineSafe=safeMovieProviderMatch(x,cine);
  const tmdbSafe=safeMovieProviderMatch(x,t);
  const cineId=cineSafe&&/^tt\d+$/.test(String(cine?.id||''))?cine.id:null;
  const tmdbImdb=tmdbSafe&&/^tt\d+$/.test(String(t?.imdb||''))?t.imdb:null;
  const tmdbId=tmdbSafe&&t?.id?`tmdb:${t.id}`:null;

  // Prefer a validated TMDB identity because the search is localized (cs-CZ) and
  // provides an external IMDb id when available. Cinemeta is used only when it
  // independently passes the same source-title/year validation.
  const standardId=tmdbImdb||tmdbId||cineId;
  if(!standardId){
    log(`safe-movie no-standard-id source=${x?.name||'-'} cineSafe=${cineSafe} tmdbSafe=${tmdbSafe}`);
    return null;
  }

  if(cineId&&tmdbImdb&&cineId!==tmdbImdb){
    log(`safe-movie provider-conflict source=${x.name} cine=${cineId} tmdb=${tmdbImdb}; using=${tmdbImdb}`);
  }
  if(!cineSafe&&cine){
    log(`safe-movie rejected-cinemeta source=${x.name} candidate=${cine.name||cine.title||cine.id||'-'} id=${cine.id||'-'}`);
  }
  if(!tmdbSafe&&t){
    log(`safe-movie rejected-tmdb source=${x.name} candidate=${t.title||t.name||t.id||'-'} id=${t.id||'-'}`);
  }

  let meta=localMeta(req,x,'movie',false);
  const chosenTmdb=tmdbSafe&&Boolean(tmdbImdb||tmdbId);
  if(chosenTmdb){
    const date=t.release_date||t.first_air_date;
    meta={
      ...meta,
      name:t.title||t.name||meta.name,
      poster:t.poster_path?`https://image.tmdb.org/t/p/w500${t.poster_path}`:meta.poster,
      background:t.backdrop_path?`https://image.tmdb.org/t/p/original${t.backdrop_path}`:meta.background,
      description:t.overview||meta.description,
      releaseInfo:date?.slice(0,4)||meta.releaseInfo,
      imdbRating:t.vote_average?Number(t.vote_average).toFixed(1):meta.imdbRating
    };
  }else if(cineSafe&&cine){
    meta={
      ...meta,
      name:cine.name||cine.title||meta.name,
      poster:cine.poster||meta.poster,
      background:cine.background||meta.background,
      description:cine.description||meta.description,
      releaseInfo:cine.releaseInfo||meta.releaseInfo,
      imdbRating:cine.imdbRating||meta.imdbRating,
      genres:cine.genres||meta.genres
    };
  }

  meta.id=standardId;
  meta.type='movie';
  delete meta.videos;
  delete meta.streams;
  if(meta.behaviorHints){
    const bh={...meta.behaviorHints};
    delete bh.defaultVideoId;
    if(Object.keys(bh).length)meta.behaviorHints=bh;else delete meta.behaviorHints;
  }
  rememberStandardSourceLink(standardId,x);
  if(x?.id)rememberDirectVideoSource(x);
  return meta;
};

function manifest(){
  return{
    id:'community.sktorrent.catalogs',version:'1.9.4',name:'SKTorrent Katalógy',
    description:'SKTorrent katalógy s bezpečným overením filmových IMDb/TMDB identít podľa pôvodného názvu a roku; nesprávne provider zhody sa nepoužijú.',
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
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.9.4',safeMovieIdentity:true,providerConflictGuard:true,referenceMovieIds:true,referenceSeriesIds:true,tmdbSeriesEpisodes:true,standardEpisodeVideoIds:true,nuvioMultiAddonAggregation:true,streamLanguageFlags:true,streamSubtitleInfo:true,fullCatalogPagination:true,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
