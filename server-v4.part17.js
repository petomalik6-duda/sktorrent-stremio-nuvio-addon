
// v1.9.0: reference meta-addon behavior for movies: no videos/defaultVideoId/embedded streams
const _resolveMetaBeforeReferenceMovieMode=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 const m=await _resolveMetaBeforeReferenceMovieMode(req,x,type,c,concert);
 if(type==='movie'&&m){
  const mid=String(m.id||'');
  // Reference meta addons expose movie identity + metadata only.
  // For single-video movie items Nuvio/Stremio then use meta.id as videoId
  // and query every compatible installed stream addon.
  if(/^tt\d+$/.test(mid)||mid.startsWith('tmdb:')){
   if(x?.id)rememberStandardSourceLink(mid,x);
   delete m.videos;
   if(m.behaviorHints){
    const bh={...m.behaviorHints};
    delete bh.defaultVideoId;
    if(Object.keys(bh).length)m.behaviorHints=bh;else delete m.behaviorHints;
   }
   // Defensive cleanup for non-standard extensions sometimes copied from metadata providers.
   delete m.streams;
  }
 }
 return m
};
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.9.0',name:'SKTorrent Katalógy',description:'SKTorrent katalógy v reference-meta režime: filmy používajú čisté IMDb/TMDB meta ID bez videos, embedded streams a defaultVideoId, takže Nuvio načíta všetky kompatibilné stream addony; SKTorrent stream odpovedá pod rovnakým ID.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.9.0',catalogs:ALL_CATS.length,referenceMovieMetaMode:true,movieVideosOmitted:true,movieEmbeddedStreamsOmitted:true,noStandardDefaultVideoId:true,nuvioMultiAddonAggregation:true,standardSourceLink:true,streamLanguageFlags:true,streamSubtitleInfo:true,seriesEpisodeGrouping:true,localSeriesFallback:true,fullCatalogPagination:true,usernamePasswordLogin:true,at:new Date().toISOString()}));
