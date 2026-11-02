'use strict';
const aliasPrefix='sktmovie';
function imdbId(meta){
 for(const value of [meta?.imdb_id,meta?.imdbId,meta?.imdb,meta?.id]){
  const id=String(value||'').trim();
  if(/^tt\d+$/i.test(id))return id.toLowerCase();
 }
 return null;
}
function sharedVideoId(meta){
 const imdb=imdbId(meta);if(imdb)return imdb;
 const tmdb=String(meta?.id||'').match(/^tmdb:([1-9]\d*)$/i);
 return tmdb?`tmdb:${tmdb[1]}`:null;
}
function normalizeVideos(meta,videoId){
 const current=Array.isArray(meta?.videos)?meta.videos:[];
 if(!current.length)return [{id:videoId,title:meta?.name||videoId}];
 let hasShared=false;
 const videos=current.map((video,index)=>{
  if(!video||typeof video!=='object')return video;
  const id=String(video.id||'');
  const shouldNormalize=index===0||/^skt[cv]:/i.test(id)||id===String(meta.id||'')||(/^tmdb:[1-9]\d*$/i.test(id)&&/^tt\d+$/i.test(videoId));
  if(!shouldNormalize){if(id===videoId)hasShared=true;return video;}
  hasShared=true;return {...video,id:videoId};
 });
 if(!hasShared)videos.unshift({id:videoId,title:meta?.name||videoId});
 return videos;
}
function adaptMovie(meta){
 if(!meta||meta.type!=='movie')return meta;
 const videoId=sharedVideoId(meta);if(!videoId)return meta;
 const tmdb=String(meta.id||'').match(/^tmdb:([1-9]\d*)$/i);
 const base={...meta,media_type:'movie',behaviorHints:{...meta.behaviorHints,defaultVideoId:videoId},videos:normalizeVideos(meta,videoId)};
 if(!tmdb)return base;
 return {...base,id:aliasPrefix+tmdb[1],tmdb_id:Number(tmdb[1]),moviedb_id:Number(tmdb[1])};
}
function adaptManifest(manifest){
 return {...manifest,id:manifest.id+'.wako',name:manifest.name+' • Wako',resources:(manifest.resources||[]).map(r=>{
  if(!r||typeof r!=='object'||!['meta','stream'].includes(r.name)||!r.types?.includes('movie'))return r;
  return {...r,idPrefixes:[...new Set([...(r.idPrefixes||manifest.idPrefixes||[]),aliasPrefix])]};
 }),idPrefixes:[...new Set([...(manifest.idPrefixes||[]),aliasPrefix])]};
}
function middleware(req,res,next){
 if(!req.url.startsWith('/wako/'))return next();
 req.sktWakoCompat=true;
 const original=req.url.match(/\/(meta|stream)\/(movie|series)\/([^/?]+)\.json(?=\?|$)/);
 if(original){req.sktWakoOriginalType=original[2];try{req.sktWakoOriginalId=decodeURIComponent(original[3])}catch{}}
 req.url=req.url.slice('/wako'.length).replace(/\/(meta|stream)\/(?:movie|series)\/sktmovie([1-9]\d*)\.json(?=\?|$)/,'/$1/movie/tmdb:$2.json');
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
module.exports={adaptMovie,adaptManifest,middleware,install,sharedVideoId,normalizeVideos};
