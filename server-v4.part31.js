
// v2.2.5: Wako concert cards are enriched to IMDb in the catalog itself.
// Wako can jump straight from a catalog card to stream lookup without fetching
// meta first, so detail-only TMDB -> IMDb enrichment is not sufficient.
const {resolveTmdbToImdb,resolveTmdbBatchToImdb}=require('./external-id-resolver');
const WAKO_CATALOG_ID_TTL=6*60*60*1000;
const wakoCatalogTmdbByImdb=new Map();
function wakoRememberCatalogId(imdb,tmdb){
 imdb=String(imdb||'').toLowerCase();tmdb=Number(tmdb);
 if(!/^tt\d+$/.test(imdb)||!Number.isSafeInteger(tmdb)||tmdb<1)return;
 wakoCatalogTmdbByImdb.set(imdb,{tmdb,expires:Date.now()+WAKO_CATALOG_ID_TTL});
 if(wakoCatalogTmdbByImdb.size>1000)wakoCatalogTmdbByImdb.delete(wakoCatalogTmdbByImdb.keys().next().value);
}
function wakoCatalogTmdb(imdb){
 const key=String(imdb||'').toLowerCase(),hit=wakoCatalogTmdbByImdb.get(key);
 if(!hit)return null;if(hit.expires<=Date.now()){wakoCatalogTmdbByImdb.delete(key);return null}return hit.tmdb;
}
function wakoMetaTmdb(meta){
 const direct=String(meta?.id||'').match(/^tmdb:([1-9]\d*)$/i);if(direct)return Number(direct[1]);
 for(const value of [meta?.tmdb_id,meta?.moviedb_id]){const id=Number(value);if(Number.isSafeInteger(id)&&id>0)return id}
 return null;
}
function wakoMetaImdb(meta){
 for(const value of [meta?.imdb_id,meta?.imdbId,meta?.imdb,meta?.id]){const id=String(value||'').trim().toLowerCase();if(/^tt\d+$/.test(id))return id}
 return null;
}

const wakoImdbResolveBase=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 const meta=await wakoImdbResolveBase(req,x,type,c,concert);
 if(!req?.sktWakoCompat||!req?.sktWakoOriginalId||!concert||!meta||meta.type!=='movie')return meta;
 if(/^tt\d+$/i.test(String(meta.imdb_id||meta.id||'')))return meta;
 const tmdb=String(meta.id||'').match(/^tmdb:([1-9]\d*)$/i);if(!tmdb)return meta;
 const imdb=await resolveTmdbToImdb(Number(tmdb[1]),{tmdbKey:c?.tmdbKey||process.env.TMDB_API_KEY});
 if(!imdb)return meta;
 wakoRememberCatalogId(imdb,Number(tmdb[1]));
 try{rememberConcertLink(imdb,x)}catch{}
 try{if(typeof rememberStandardSourceLink==='function')rememberStandardSourceLink(imdb,x)}catch{}
 log('Wako TMDB->IMDb',meta.id,'=>',imdb);
 return {...meta,imdb_id:imdb};
};

const wakoCatalogImdbBase=catalog;
catalog=async function(req,res,c){
 if(!req?.sktWakoCompat||req.params?.type!=='movie'||!/koncerty$/i.test(String(req.params?.id||'')))return wakoCatalogImdbBase(req,res,c);
 const json=res.json;
 res.json=async function(body){
  if(!Array.isArray(body?.metas))return json.call(this,body);
  const metas=body.metas,need=[];
  for(const meta of metas){
   const tmdb=wakoMetaTmdb(meta),imdb=wakoMetaImdb(meta);
   if(imdb&&tmdb)wakoRememberCatalogId(imdb,tmdb);
   else if(tmdb&&!need.includes(tmdb)&&need.length<30)need.push(tmdb);
  }
  const mapped=need.length?await resolveTmdbBatchToImdb(need,{tmdbKey:c?.tmdbKey||process.env.TMDB_API_KEY}):new Map();
  let hits=0;
  const enriched=metas.map(meta=>{
   const tmdb=wakoMetaTmdb(meta),existing=wakoMetaImdb(meta),imdb=existing||(tmdb?mapped.get(tmdb):null);
   if(!imdb)return meta;
   if(tmdb)wakoRememberCatalogId(imdb,tmdb);
   if(!existing)hits++;
   return {...meta,id:imdb,imdb_id:imdb,...(tmdb?{tmdb_id:tmdb,moviedb_id:tmdb}:{})};
  });
  log(`Wako catalog IMDb ids catalog=${req.params.id} checked=${need.length} mapped=${hits}`);
  res.set('Cache-Control','private, no-store');
  return json.call(this,{...body,metas:enriched});
 };
 try{return await wakoCatalogImdbBase(req,res,c)}finally{res.json=json}
};

function wakoWrapMappedRoute(base){
 return async function(req,res,c){
  if(!req?.sktWakoCompat||req.params?.type!=='movie'||!/^tt\d+$/i.test(String(req.params?.id||'')))return base(req,res,c);
  const tmdb=wakoCatalogTmdb(req.params.id);if(!tmdb)return base(req,res,c);
  const original=req.params.id;req.params.id=`tmdb:${tmdb}`;
  try{return await base(req,res,c)}finally{req.params.id=original}
 };
}
meta=wakoWrapMappedRoute(meta);
stream=wakoWrapMappedRoute(stream);

require('./wako-mode').install(app);
const wakoModeManifestBase=manifest;
manifest=function(){return {...wakoModeManifestBase(),version:'2.2.5'}};
