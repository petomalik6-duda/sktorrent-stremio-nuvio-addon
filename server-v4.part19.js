
// v1.9.2: reference-style series identities and episode playback IDs
function standardSeriesIdParts(id){
 const s=String(id||'');
 let m=s.match(/^(tt\d+):(\d+):(\d+)$/i);if(m)return{base:m[1],season:Number(m[2]),episode:Number(m[3])};
 m=s.match(/^(tmdb:\d+):(\d+):(\d+)$/i);if(m)return{base:m[1],season:Number(m[2]),episode:Number(m[3])};
 if(/^tt\d+$/i.test(s)||/^tmdb:\d+$/i.test(s))return{base:s,season:null,episode:null};
 return null
}

async function resolveSeriesGroup(req,g,c){
 const rep={...g.items[0],name:g.title};
 let m=await resolveMeta(req,rep,'series',c,false);
 let mid=String(m?.id||'');

 // Resolve to the same shared identity model as the reference addon: IMDb first, otherwise TMDB.
 if(!(/^tt\d+$/.test(mid)||/^tmdb:\d+$/.test(mid))){
  try{
   const t=await tmdbSearch(rep,'series',c,false);
   if(t?.imdb)mid=t.imdb;
   else if(t?.id)mid=`tmdb:${t.id}`;
   if(t&&m){
    const date=t.first_air_date||t.release_date;
    m={...m,id:mid,name:t.name||t.title||m.name,poster:t.poster_path?`https://image.tmdb.org/t/p/w500${t.poster_path}`:m.poster,background:t.backdrop_path?`https://image.tmdb.org/t/p/original${t.backdrop_path}`:m.background,description:t.overview||m.description,releaseInfo:date?.slice(0,4)||m.releaseInfo};
   }
  }catch(e){log('series reference tmdb',g.title,e.message)}
 }

 if(m&&(/^tt\d+$/.test(mid)||/^tmdb:\d+$/.test(mid))){
  m.id=mid;
  // Do not replace standard episode IDs with SKTorrent-local IDs.
  if(m.behaviorHints){const bh={...m.behaviorHints};delete bh.defaultVideoId;if(Object.keys(bh).length)m.behaviorHints=bh;else delete m.behaviorHints}
  return m
 }

 // Only series with no safe external identity keep the grouped local fallback.
 seriesGroupCacheSet(g.id,g);
 return localSeriesGroupMeta(req,g)
}

async function streamsForStandard(type,id,c){
 const sp=type==='series'?standardSeriesIdParts(id):null;
 const bits=String(id).split(':');
 const base=sp?.base||(/^tt\d+$/.test(bits[0])?bits[0]:(String(id).startsWith('tmdb:')?bits.slice(0,2).join(':'):id));
 const season=sp?.season||null,ep=sp?.episode||null;
 const target=await targetFromStandard(type,base,c);if(!target)return[];
 const qs=[target.name,target.originalName,target.name&&String(target.name).split(':')[0]].filter(Boolean),all=[];
 for(const q of[...new Set(qs)]){try{all.push(...await searchItems(q,c,4))}catch{}}
 let ranked=[...new Map(all.map(x=>[x.id,x])).values()].map(x=>({x,s:scoreCandidate(x,target,type,season,ep),kind:'normal'})).filter(z=>z.s>=55);
 if(type==='movie')ranked.push(...await concertCandidatesForStandard(target,base,c));
 ranked=[...new Map(ranked.sort((a,b)=>b.s-a.s).map(z=>[z.x.id,z])).values()].slice(0,10);
 const streams=[];
 for(const z of ranked.slice(0,5)){
  try{const td=await torrentData(z.x,c),f=chooseVideoFile(td,type,season,ep);if(f)streams.push(makeStream(z.x,td,f,base))}
  catch(e){log(`torrent ${z.kind}`,z.x.name,e.message)}
 }
 return streams
}

function manifest(){
 return{
  id:'community.sktorrent.catalogs',version:'1.9.2',name:'SKTorrent Katalógy',
  description:'SKTorrent katalógy s referenčným tt/tmdb modelom pre filmy aj seriály; štandardné episode IDs umožňujú Nuvio agregovať všetky kompatibilné stream addony.',
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
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.9.2',referenceMovieIds:true,referenceSeriesIds:true,tmdbEpisodeIds:true,seriesEpisodeGrouping:true,localSeriesFallback:true,nuvioMultiAddonAggregation:true,streamLanguageFlags:true,streamSubtitleInfo:true,fullCatalogPagination:true,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
