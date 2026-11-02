const {test}=require('node:test');const assert=require('node:assert/strict');
const {movieContract}=require('../movie-contract');
test('TMDB-only concert keeps shared stream ID and explicit movie identity',()=>{
 const original={id:'tmdb:671575',type:'movie',name:'Kabát',behaviorHints:{other:true}};
 const m=movieContract(original,true);
 assert.equal(m.id,'tmdb:671575');assert.equal(m.type,'movie');assert.equal(m.media_type,'movie');
 assert.equal(m.tmdb_id,671575);assert.equal(m.moviedb_id,671575);
 assert.equal(m.behaviorHints.defaultVideoId,m.id);assert.equal(m.behaviorHints.other,true);
 assert.deepEqual(m.videos,[{id:'tmdb:671575',title:'Kabát'}]);assert.equal(m.imdb_id,undefined);
 assert.equal(m.streams,undefined);assert.equal(m.videos[0].streams,undefined);assert.equal(original.videos,undefined);
});
test('catalog preview does not embed videos',()=>assert.equal(movieContract({id:'tmdb:671575',type:'movie'}).videos,undefined));
test('IMDb movies explicitly retain real IMDb identity',()=>assert.equal(movieContract({id:'tt123',type:'movie'}).imdb_id,'tt123'));
test('series, local fallbacks and multipart videos are preserved',()=>{
 for(const m of [{id:'tmdb:671575',type:'series'},{id:'sktc:abc',type:'movie'},null])assert.strictEqual(movieContract(m,true),m);
 const videos=[{id:'part:1'},{id:'part:2'}];assert.strictEqual(movieContract({id:'tmdb:1',type:'movie',videos},true).videos,videos);
});
