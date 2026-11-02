'use strict';
// Explicit movie identity for clients that otherwise infer a series from ':'.
// Keep the provider ID intact: stream addons expect tmdb:<number>, not a
// made-up IMDb ID or an extra movie: segment.
function movieContract(meta, detail=false) {
 if(!meta||meta.type!=='movie')return meta;
 const id=String(meta.id||''),tmdb=id.match(/^tmdb:([1-9]\d*)$/),imdb=/^tt\d+$/.test(id);
 if(!tmdb&&!imdb)return meta;
 const result={...meta,media_type:'movie',behaviorHints:{...meta.behaviorHints,defaultVideoId:id}};
 if(tmdb){const n=Number(tmdb[1]);if(Number.isSafeInteger(n)){result.tmdb_id=n;result.moviedb_id=n;}}
 if(imdb)result.imdb_id=id;
 // Never replace a genuine multipart movie's video list.
 if(detail&&(!Array.isArray(meta.videos)||!meta.videos.length))result.videos=[{id,title:meta.name||id}];
 return result;
}
module.exports={movieContract};
