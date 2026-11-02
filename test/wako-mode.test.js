const {test}=require('node:test');const assert=require('node:assert/strict');
const express=require('express');const {adaptMovie,install,rewriteWakoUrl}=require('../wako-mode');

test('TMDB card stays a movie and exposes no episode list',()=>{
 const movie={id:'tmdb:671575',type:'movie',name:'Kabát',behaviorHints:{defaultVideoId:'tmdb:671575'},videos:[{id:'tmdb:671575',title:'Kabát'}]};
 const result=adaptMovie(movie);
 assert.equal(result.id,'sktmovie671575');assert.equal(result.type,'movie');assert.equal(result.media_type,'movie');
 assert.equal(result.tmdb_id,671575);assert.equal(result.moviedb_id,671575);
 assert.equal(result.videos,undefined);assert.equal(result.behaviorHints,undefined);
 assert.equal(movie.videos[0].id,'tmdb:671575');assert.equal(movie.behaviorHints.defaultVideoId,'tmdb:671575');
});

test('paired concert keeps IMDb cross-addon lookup but removes episode semantics',()=>{
 const concert={id:'tmdb:671575',type:'movie',name:'Kabát',imdb_id:'tt1234567',behaviorHints:{defaultVideoId:'sktv:2c06',other:true},videos:[{id:'sktv:2c06',title:'SKTorrent koncert',season:1,episode:1}]};
 const result=adaptMovie(concert);
 assert.equal(result.id,'sktmovie671575');assert.equal(result.type,'movie');assert.equal(result.imdb_id,'tt1234567');
 assert.equal(result.videos,undefined);assert.equal(result.behaviorHints.defaultVideoId,undefined);assert.equal(result.behaviorHints.other,true);
 assert.equal(concert.videos[0].season,1);assert.equal(concert.behaviorHints.defaultVideoId,'sktv:2c06');
});

test('TMDB-only paired concert remains a single-video movie',()=>{
 const concert={id:'tmdb:671575',type:'movie',name:'Kabát',videos:[{id:'sktc:2c06',title:'SKTorrent koncert'}]};
 const result=adaptMovie(concert);
 assert.equal(result.id,'sktmovie671575');assert.equal(result.tmdb_id,671575);assert.equal(result.videos,undefined);assert.equal(result.behaviorHints,undefined);
});

test('IMDb movie or concert uses IMDb as the movie identity without videos',()=>{
 const concert={id:'tt7654321',type:'movie',name:'Live',videos:[{id:'sktv:abc',title:'Live source'}]};
 const result=adaptMovie(concert);
 assert.equal(result.id,'tt7654321');assert.equal(result.imdb_id,'tt7654321');assert.equal(result.videos,undefined);assert.equal(result.behaviorHints,undefined);
});

test('local unmatched concert stays local but cannot look like an episode',()=>{
 const local={id:'sktc:abc',type:'movie',name:'Local concert',behaviorHints:{defaultVideoId:'sktv:abc'},videos:[{id:'sktv:abc',season:1,episode:1}]};
 const result=adaptMovie(local);
 assert.equal(result.id,'sktc:abc');assert.equal(result.type,'movie');assert.equal(result.videos,undefined);assert.equal(result.behaviorHints,undefined);
});

test('series-shaped requests are only collapsed for Wako movie aliases and local concert ids',()=>{
 assert.equal(rewriteWakoUrl('/wako/token/stream/series/sktmovie671575:1:1.json'),'/token/stream/movie/tmdb%3A671575.json');
 assert.equal(rewriteWakoUrl('/wako/token/stream/series/sktc%3Aabc%3A1%3A1.json'),'/token/stream/movie/sktc%3Aabc.json');
 assert.equal(rewriteWakoUrl('/wako/token/stream/series/tt1234567:1:1.json'),'/token/stream/series/tt1234567:1:1.json');
});

test('opt-in routing preserves config token, forces alias detail to movie and leaves normal mode untouched',async()=>{
 const app=express();
 const manifest={id:'community.sktorrent.catalogs',name:'SKTorrent',resources:[{name:'meta',types:['movie'],idPrefixes:['tmdb:']},{name:'stream',types:['movie'],idPrefixes:['tmdb:','sktc:']}],catalogs:[],idPrefixes:['tmdb:','sktc:']};
 app.get(['/:token/manifest.json','/manifest.json'],(q,r)=>r.json(manifest));
 app.get('/:token/catalog/movie/test.json',(q,r)=>r.json({metas:[{id:'tmdb:671575',type:'movie',name:'Kabát'}]}));
 app.get('/:token/meta/:type/:id.json',(q,r)=>r.json({meta:{id:q.params.id,type:q.params.type,name:'Kabát',imdb_id:'tt1234567',videos:[{id:'sktv:abc',season:1,episode:1}],behaviorHints:{defaultVideoId:'sktv:abc'}}}));
 app.get('/:token/stream/:type/:id.json',(q,r)=>r.json({streams:[{infoHash:'a'.repeat(40),fileIdx:0}],request:{...q.params}}));
 install(app);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const get=async p=>{const r=await fetch(base+p,{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return r.json()};
  assert.deepEqual(await get('/private-config/manifest.json'),manifest);
  const m=await get('/wako/private-config/manifest.json');assert.equal(m.id,manifest.id+'.wako');assert.ok(m.resources[0].idPrefixes.includes('sktmovie'));
  const cat=await get('/wako/private-config/catalog/movie/test.json');assert.equal(cat.metas[0].id,'sktmovie671575');assert.equal(cat.metas[0].type,'movie');
  const meta=await get('/wako/private-config/meta/series/sktmovie671575.json');
  assert.equal(meta.meta.type,'movie');assert.equal(meta.meta.id,'sktmovie671575');assert.equal(meta.meta.imdb_id,'tt1234567');assert.equal(meta.meta.videos,undefined);assert.equal(meta.meta.behaviorHints,undefined);
  for(const path of ['/wako/private-config/stream/movie/tmdb%3A671575.json','/wako/private-config/stream/series/sktmovie671575:1:1.json']){
   const j=await get(path);assert.equal(j.request.token,'private-config');assert.equal(j.request.type,'movie');assert.equal(j.request.id,'tmdb:671575');assert.equal(j.streams[0].fileIdx,0);
  }
  const local=await get('/wako/private-config/stream/series/sktc%3Aabc%3A1%3A1.json');assert.equal(local.request.type,'movie');assert.equal(local.request.id,'sktc:abc');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
