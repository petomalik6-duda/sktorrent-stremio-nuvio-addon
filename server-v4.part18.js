
// v1.9.1: strict reference-addon movie identity model: movies are only tt... or tmdb:..., never local skt ids
const _resolveMetaBeforeReferenceIds = resolveMeta;
resolveMeta = async function(req,x,type,c,concert=false){
  if(type!=='movie' || concert) return _resolveMetaBeforeReferenceIds(req,x,type,c,concert);

  let meta = localMeta(req,x,'movie',false);
  let cine = null, t = null;
  try { cine = await findCinemeta(x,'movie'); } catch(e) { log('reference cine',x.name,e.message); }
  try { t = await tmdbSearch(x,'movie',c,false); } catch(e) { log('reference tmdb',x.name,e.message); }

  const cineId = /^tt\d+$/.test(String(cine?.id||'')) ? cine.id : null;
  const tmdbImdb = /^tt\d+$/.test(String(t?.imdb||'')) ? t.imdb : null;
  const tmdbId = t?.id ? `tmdb:${t.id}` : null;
  const standardId = cineId || tmdbImdb || tmdbId;
  if(!standardId){
    log(`reference-meta no-standard-id source=${x.name}`);
    return null;
  }

  if(cine){
    meta = {
      ...meta,
      name: cine.name || meta.name,
      poster: cine.poster || meta.poster,
      background: cine.background || meta.background,
      description: cine.description || meta.description,
      releaseInfo: cine.releaseInfo || meta.releaseInfo,
      imdbRating: cine.imdbRating || meta.imdbRating,
      genres: cine.genres || meta.genres
    };
  }
  if(t){
    const date = t.release_date || t.first_air_date;
    meta = {
      ...meta,
      name: t.title || t.name || meta.name,
      poster: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : meta.poster,
      background: t.backdrop_path ? `https://image.tmdb.org/t/p/original${t.backdrop_path}` : meta.background,
      description: t.overview || meta.description,
      releaseInfo: date?.slice(0,4) || meta.releaseInfo,
      imdbRating: t.vote_average ? Number(t.vote_average).toFixed(1) : meta.imdbRating
    };
  }

  meta.id = standardId;
  meta.type = 'movie';
  delete meta.videos;
  delete meta.streams;
  if(meta.behaviorHints){
    const bh = {...meta.behaviorHints};
    delete bh.defaultVideoId;
    if(Object.keys(bh).length) meta.behaviorHints = bh; else delete meta.behaviorHints;
  }
  rememberStandardSourceLink(standardId,x);
  if(x?.id) rememberDirectVideoSource(x);
  return meta;
};

function manifest(){
  return {
    id:'community.sktorrent.catalogs',
    version:'1.9.1',
    name:'SKTorrent Katalógy',
    description:'SKTorrent katalógy v reference tt/tmdb režime pre filmy: žiadne lokálne movie ID, bez embedded streamov/defaultVideoId, aby Nuvio agregovalo všetky kompatibilné stream addony.',
    resources:[
      {name:'catalog',types:['movie','series']},
      {name:'meta',types:['movie'],idPrefixes:['tt','tmdb:']},
      {name:'meta',types:['series'],idPrefixes:['tt','tmdb:','sktseries:','sktseriesg:']},
      {name:'stream',types:['movie'],idPrefixes:['tt','tmdb:']},
      {name:'stream',types:['series'],idPrefixes:['tt','tmdb:','sktseries:','sktseriesg:','sktv:','sktf:']}
    ],
    types:['movie','series'],
    catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),
    idPrefixes:['tt','tmdb:','sktseries:','sktseriesg:'],
    behaviorHints:{configurable:true,configurationRequired:false}
  };
}

removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.9.1',referenceMovieIds:true,moviePrefixes:['tt','tmdb:'],localMovieIds:false,embeddedMovieStreams:false,defaultMovieVideoId:false,standardSourceLink:true,streamLanguageFlags:true,streamSubtitleInfo:true,seriesEpisodeGrouping:true,fullCatalogPagination:true,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
