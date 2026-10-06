
// v1.8.8: keep standard IMDb/TMDB video IDs so Nuvio can aggregate streams from all installed addons
const _resolveMetaBeforeSharedVideoId=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 const m=await _resolveMetaBeforeSharedVideoId(req,x,type,c,concert);
 if(type==='movie'&&m){
  const mid=String(m.id||'');
  // Keep exact SKTorrent source association from v1.8.6, but do not force a private sktv: playback ID.
  if(x?.id)rememberDirectVideoSource(x);
  if((/^tt\d+$/.test(mid)||mid.startsWith('tmdb:'))&&x?.id)rememberStandardSourceLink(mid,x);
  if(/^tt\d+$/.test(mid)||mid.startsWith('tmdb:')){
   m.behaviorHints={...(m.behaviorHints||{}),defaultVideoId:mid};
  }else if(x?.id){
   // Local metadata has no shared standard ID; only then use direct SKTorrent playback.
   m.behaviorHints={...(m.behaviorHints||{}),defaultVideoId:directVideoId(x)};
  }
 }
 return m
};
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.8',name:'SKTorrent Katalógy',description:'SKTorrent katalógy so štandardnými IMDb/TMDB video ID pre agregáciu streamov v Nuvio, plus vlastný SKTorrent stream a priamy fallback pre lokálne položky.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.8',catalogs:ALL_CATS.length,sharedStandardVideoId:true,nuvioMultiAddonAggregation:true,directNuvioPlaybackFallback:true,standardSourceLink:true,strictMovieMetadataMatching:true,streamLanguageFlags:true,streamSubtitleInfo:true,seriesEpisodeGrouping:true,localSeriesFallback:true,fullCatalogPagination:true,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
