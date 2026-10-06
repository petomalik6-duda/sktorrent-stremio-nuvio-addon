
// v1.8.9: do not force defaultVideoId for standard movie IDs; let Nuvio aggregate by meta.id across addons
const _resolveMetaBeforeNoDefaultVideo=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 const m=await _resolveMetaBeforeNoDefaultVideo(req,x,type,c,concert);
 if(type==='movie'&&m){
  const mid=String(m.id||'');
  if((/^tt\d+$/.test(mid)||mid.startsWith('tmdb:'))){
   if(x?.id)rememberStandardSourceLink(mid,x);
   if(m.behaviorHints){
    const bh={...m.behaviorHints};
    delete bh.defaultVideoId;
    if(Object.keys(bh).length)m.behaviorHints=bh;else delete m.behaviorHints;
   }
  }else if(x?.id){
   m.behaviorHints={...(m.behaviorHints||{}),defaultVideoId:directVideoId(x)};
  }
 }
 return m
};
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.9',name:'SKTorrent Katalógy',description:'SKTorrent katalógy so štandardnými IMDb/TMDB meta ID bez vynúteného defaultVideoId, aby Nuvio agregovalo streamy zo všetkých addonov; SKTorrent stream zostáva dostupný pod rovnakým štandardným ID.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.9',catalogs:ALL_CATS.length,noStandardDefaultVideoId:true,nuvioMultiAddonAggregation:true,standardSourceLink:true,strictMovieMetadataMatching:true,streamLanguageFlags:true,streamSubtitleInfo:true,seriesEpisodeGrouping:true,localSeriesFallback:true,fullCatalogPagination:true,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
