const {test}=require('node:test');const assert=require('node:assert/strict');
const express=require('express');const {adaptMovie,install}=require('../wako-mode');
test('card alias is unambiguous while video identity remains shared',()=>{
 const movie={id:'tmdb:671575',type:'movie',name:'Kabát'};const result=adaptMovie(movie);
 assert.equal(result.id,'sktmovie671575');assert.equal(result.type,'movie');
 assert.equal(result.behaviorHints.defaultVideoId,'tmdb:671575');assert.deepEqual(result.videos,[{id:'tmdb:671575',title:'Kabát'}]);
 assert.deepEqual(movie,{id:'tmdb:671575',type:'movie',name:'Kabát'});assert.equal(result.imdb_id,undefined);
 for(const m of [{id:'tmdb:123',type:'series'},{id:'tt123',type:'movie'},{id:'sktc:abc',type:'movie'}])assert.strictEqual(adaptMovie(m),m);
});
test('opt-in routing preserves config token, normalizes alias requests and leaves standard stream ID intact',async()=>{
 const app=express();
 const manifest={id:'community.sktorrent.catalogs',name:'SKTorrent',resources:[{name:'meta',types:['movie'],idPrefixes:['tmdb:']}],catalogs:[],idPrefixes:['tmdb:']};
 app.get(['/:token/manifest.json','/manifest.json'],(q,r)=>r.json(manifest));
 app.get('/:token/catalog/movie/test.json',(q,r)=>r.json({metas:[{id:'tmdb:671575',type:'movie',name:'Kabát'}]}));
 app.get('/:token/meta/:type/:id.json',(q,r)=>r.json({meta:{id:q.params.id,type:q.params.type,name:'Kabát'}}));
 app.get('/:token/stream/:type/:id.json',(q,r)=>r.json({streams:[{infoHash:'a'.repeat(40),fileIdx:0}],request:{...q.params}}));
 install(app);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const get=async p=>{const r=await fetch(base+p,{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return r.json()};
  assert.deepEqual(await get('/private-config/manifest.json'),manifest);
  const m=await get('/wako/private-config/manifest.json');assert.equal(m.id,manifest.id+'.wako');assert.ok(m.resources[0].idPrefixes.includes('sktmovie'));
  const cat=await get('/wako/private-config/catalog/movie/test.json');assert.equal(cat.metas[0].id,'sktmovie671575');
  const meta=await get('/wako/private-config/meta/series/sktmovie671575.json');assert.equal(meta.meta.type,'movie');assert.equal(meta.meta.videos[0].id,'tmdb:671575');
  for(const path of ['/wako/private-config/stream/movie/tmdb%3A671575.json','/wako/private-config/stream/series/sktmovie671575.json']){
   const j=await get(path);assert.equal(j.request.token,'private-config');assert.equal(j.request.type,'movie');assert.equal(j.request.id,'tmdb:671575');assert.equal(j.streams[0].fileIdx,0);
  }
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
