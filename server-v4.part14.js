
// v1.8.7: direct playback IDs for Nuvio while preserving IMDb/TMDB metadata
const DIRECT_VIDEO_SOURCE_TTL=24*60*60*1000;
function directVideoId(x){return x?.id?`sktv:${x.id}`:null}
function rememberDirectVideoSource(x){if(!x?.id)return;cache.set(`direct-video:${x.id}`,{v:x,e:Date.now()+DIRECT_VIDEO_SOURCE_TTL})}
function getDirectVideoSource(tid){const h=cache.get(`direct-video:${tid}`);return h&&h.e>Date.now()?h.v:null}
const _resolveMetaBeforeDirectVideo=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 const m=await _resolveMetaBeforeDirectVideo(req,x,type,c,concert);
 if(type==='movie'&&!concert&&m&&x?.id){
  rememberDirectVideoSource(x);
  m.behaviorHints={...(m.behaviorHints||{}),defaultVideoId:directVideoId(x)};
 }
 return m
};
async function findDirectVideoSource(tid,c){
 const hit=getDirectVideoSource(tid);if(hit)return hit;
 const rows=await recent(c,500,0,Math.min(60,FULL_CATALOG_MAX_PAGES));
 const x=rows.find(v=>v.id===tid);if(x)rememberDirectVideoSource(x);return x||null
}
async function stream(req,res,c){
 c=authConfig(c);const{id,type}=req.params;
 if(type==='movie'&&id.startsWith('sktv:')){
  const tid=id.slice('sktv:'.length),x=await findDirectVideoSource(tid,c);if(!x){log(`direct-video ${tid} source=missing`);return res.json({streams:[]})}
  try{const td=await torrentData(x,c),f=chooseVideoFile(td,'movie');if(!f){log(`direct-video ${tid} file=missing source=${x.name}`);return res.json({streams:[]})}const st=makeStream(x,td,f,tid);log(`direct-video ${tid} source=${x.name} stream=1 mode=${td.mode}`);return res.json({streams:[st]})}
  catch(e){log(`direct-video ${tid} source=${x.name} error=${e.message}`);return res.json({streams:[{name:'SKTorrent',title:e.message,externalUrl:x.detailUrl||BASE}]})}
 }
 if(type==='series'&&id.startsWith('sktseriesg:')){
  const p=id.split(':'),tid=p[p.length-1],season=Number(p[p.length-3])||null,ep=Number(p[p.length-2])||null,gid=p.slice(0,2).join(':'),g=await findSeriesGroupById(gid,c),x=g?.items.find(v=>v.id===tid);if(!x)return res.json({streams:[]});
  try{const td=await torrentData(x,c),f=chooseVideoFile(td,'series',season,ep);if(!f)return res.json({streams:[]});return res.json({streams:[makeStream(x,td,f,gid)]})}catch(e){return res.json({streams:[{name:'SKTorrent',title:e.message,externalUrl:x.detailUrl||BASE}]})}
 }
 if(/^tt\d+/.test(id)||id.startsWith('tmdb:')){try{return res.json({streams:await streamsForStandard(type,id,c)})}catch(e){log('standard stream',id,e.message);return res.json({streams:[]})}}
 const p=id.split(':'),tid=p[1],concert=id.startsWith('sktc:'),all=concert?await recent(c,300,CAT.CONCERTS,20):await recent(c,300,0),x=all.find(v=>v.id===tid);if(!x)return res.json({streams:[]});try{const td=await torrentData(x,c),f=chooseVideoFile(td,type);if(!f)return res.json({streams:[]});return res.json({streams:[makeStream(x,td,f,tid)]})}catch(e){return res.json({streams:[{name:'SKTorrent',title:e.message,externalUrl:x.detailUrl||BASE}]})}
}
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.7',name:'SKTorrent Katalógy',description:'SKTorrent katalógy so správnymi IMDb/TMDB detailmi a priamym Nuvio playback ID na pôvodný SKTorrent torrent.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.7',catalogs:ALL_CATS.length,directNuvioPlaybackId:true,standardSourceLink:true,strictMovieMetadataMatching:true,streamLanguageFlags:true,streamSubtitleInfo:true,seriesEpisodeGrouping:true,localSeriesFallback:true,fullCatalogPagination:true,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
