
// v2.2.3: opt-in Wako movie contract plus TMDB -> IMDb cross-addon enrichment.
const {resolveTmdbToImdb}=require('./external-id-resolver');
const wakoImdbResolveBase=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 const meta=await wakoImdbResolveBase(req,x,type,c,concert);
 if(!req?.sktWakoCompat||!req?.sktWakoOriginalId||!concert||!meta||meta.type!=='movie')return meta;
 if(/^tt\d+$/i.test(String(meta.imdb_id||meta.id||'')))return meta;
 const tmdb=String(meta.id||'').match(/^tmdb:([1-9]\d*)$/i);if(!tmdb)return meta;
 const imdb=await resolveTmdbToImdb(Number(tmdb[1]),{tmdbKey:c?.tmdbKey||process.env.TMDB_API_KEY});
 if(!imdb)return meta;
 try{rememberConcertLink(imdb,x)}catch{}
 try{if(typeof rememberStandardSourceLink==='function')rememberStandardSourceLink(imdb,x)}catch{}
 log('Wako TMDB->IMDb',meta.id,'=>',imdb);
 return {...meta,imdb_id:imdb};
};

require('./wako-mode').install(app);
const wakoModeManifestBase=manifest;
manifest=function(){return {...wakoModeManifestBase(),version:'2.2.3'}};
