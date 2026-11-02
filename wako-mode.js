'use strict';
const aliasPrefix='sktmovie';
function adaptMovie(meta){
 if(!meta||meta.type!=='movie')return meta;
 const match=String(meta.id||'').match(/^tmdb:([1-9]\d*)$/);
 if(!match||!Number.isSafeInteger(Number(match[1])))return meta;
 const videoId=meta.id;
 return {...meta,id:aliasPrefix+match[1],media_type:'movie',tmdb_id:Number(match[1]),moviedb_id:Number(match[1]),
  behaviorHints:{...meta.behaviorHints,defaultVideoId:videoId},
  videos:Array.isArray(meta.videos)&&meta.videos.length?meta.videos:[{id:videoId,title:meta.name||videoId}]};
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
module.exports={adaptMovie,adaptManifest,middleware,install};
