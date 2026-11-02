'use strict';
const aliasPrefix='sktmoviev27';
const legacyAliasPrefix='sktmovie';
const legacyAliasPrefixes=['sktmoviev24',legacyAliasPrefix];

function imdbId(meta){
 for(const value of [meta?.imdb_id,meta?.imdbId,meta?.imdb,meta?.id]){
  const id=String(value||'').trim();
  if(/^tt\d+$/i.test(id))return id.toLowerCase();
 }
 return null;
}

function tmdbId(meta){
 const fromId=String(meta?.id||'').match(/^tmdb:([1-9]\d*)$/i);
 if(fromId)return Number(fromId[1]);
 for(const value of [meta?.tmdb_id,meta?.moviedb_id]){
  const id=Number(value);
  if(Number.isSafeInteger(id)&&id>0)return id;
 }
 return null;
}

// Wako documents imdb_id as the escape hatch for add-ons that keep their own
// stable item IDs but want IMDb-based stream lookup. Keep our TMDB-derived
// private alias as meta.id and expose verified IMDb separately as imdb_id.
function adaptMovie(meta){
 if(!meta||meta.type!=='movie')return meta;
 const id=String(meta.id||'');
 const imdb=imdbId(meta),tmdb=tmdbId(meta),local=/^sktc:/i.test(id);
 if(!imdb&&!tmdb&&!local)return meta;

 const {videos:_videos,behaviorHints:_behaviorHints,...rest}=meta;
 const hints={...(_behaviorHints||{})};
 delete hints.defaultVideoId;
 delete hints.hasScheduledVideos;

 const result={...rest,type:'movie',media_type:'movie'};
 if(Object.keys(hints).length)result.behaviorHints=hints;
 if(imdb)result.imdb_id=imdb;
 if(tmdb){result.tmdb_id=tmdb;result.moviedb_id=tmdb;}
 if(tmdb&&/^tmdb:/i.test(id))result.id=aliasPrefix+tmdb;
 return result;
}

function adaptManifest(manifest){
 const wakoPrefixes=[aliasPrefix,...legacyAliasPrefixes];
 return {...manifest,id:manifest.id+'.wako',name:manifest.name+' • Wako',resources:(manifest.resources||[]).map(r=>{
  if(!r||typeof r!=='object'||!['meta','stream'].includes(r.name)||!r.types?.includes('movie'))return r;
  return {...r,idPrefixes:[...new Set([...(r.idPrefixes||manifest.idPrefixes||[]),...wakoPrefixes])]};
 }),idPrefixes:[...new Set([...(manifest.idPrefixes||[]),...wakoPrefixes])]};
}

function rewriteWakoUrl(url){
 let out=url.slice('/wako'.length);
 const match=out.match(/\/(meta|stream)\/(movie|series)\/([^/?]+)\.json(?=\?|$)/);
 if(!match)return out;
 let id;try{id=decodeURIComponent(match[3])}catch{return out;}
 let type=match[2],target=id;
 const alias=id.match(/^(?:sktmoviev27|sktmoviev24|sktmovie)([1-9]\d*)(?::\d+:\d+)?$/i);
 if(alias){type='movie';target=`tmdb:${alias[1]}`;}
 else if(type==='series'){
  const local=id.match(/^(sktc:[^:]+)(?::\d+:\d+)?$/i);
  if(local){type='movie';target=local[1];}
 }
 if(type===match[2]&&target===id)return out;
 return out.replace(match[0],`/${match[1]}/${type}/${encodeURIComponent(target)}.json`);
}

function middleware(req,res,next){
 if(!req.url.startsWith('/wako/'))return next();
 req.sktWakoCompat=true;
 const original=req.url.match(/\/(meta|stream)\/(movie|series)\/([^/?]+)\.json(?=\?|$)/);
 if(original){req.sktWakoOriginalType=original[2];try{req.sktWakoOriginalId=decodeURIComponent(original[3])}catch{}}
 req.url=rewriteWakoUrl(req.url);
 const json=res.json;
 res.json=function(body){
  let result=body;
  if(body?.resources&&body?.catalogs)result=adaptManifest(body);
  else if(Array.isArray(body?.metas))result={...body,metas:body.metas.map(adaptMovie)};
  else if(body?.meta)result={...body,meta:adaptMovie(body.meta)};
  res.set('Cache-Control','private, no-store');
  return json.call(this,result);
 };
 next();
}

function install(app){
 app.use(middleware);
 const layer=app._router.stack.pop(),index=app._router.stack.findIndex(x=>x.route);
 app._router.stack.splice(index<0?app._router.stack.length:index,0,layer);
}

module.exports={adaptMovie,adaptManifest,middleware,install,imdbId,tmdbId,rewriteWakoUrl,aliasPrefix,legacyAliasPrefix,legacyAliasPrefixes};
