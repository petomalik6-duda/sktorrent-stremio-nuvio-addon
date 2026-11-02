const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveTmdbToImdb,fromTmdb,fromWikidata,clearCache}=require('../external-id-resolver');

test('TMDB external_ids wins when IMDb is present',async()=>{
 clearCache();
 const calls=[];
 const http={get:async(url,opts)=>{calls.push(url);return{data:{imdb_id:'tt1234567'}}}};
 assert.equal(await resolveTmdbToImdb(671575,{tmdbKey:'x',http}),'tt1234567');
 assert.equal(calls.length,1);
 assert.match(calls[0],/themoviedb/);
});

test('Wikidata P4947 -> P345 is used when TMDB has no IMDb ID',async()=>{
 clearCache();
 const calls=[];
 const http={get:async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes('themoviedb'))return{data:{imdb_id:null}};
  return{data:{results:{bindings:[{imdb:{value:'tt7654321'}}]}}};
 }};
 assert.equal(await resolveTmdbToImdb(671575,{tmdbKey:'x',http}),'tt7654321');
 assert.equal(calls.length,2);
 assert.match(calls[1].opts.params.query,/wdt:P4947 "671575"/);
 assert.match(calls[1].opts.params.query,/wdt:P345/);
});

test('resolver returns null rather than inventing an IMDb ID',async()=>{
 clearCache();
 const http={get:async(url)=>url.includes('themoviedb')?{data:{imdb_id:null}}:{data:{results:{bindings:[]}}}};
 assert.equal(await resolveTmdbToImdb(671575,{tmdbKey:'x',http}),null);
});

test('invalid IDs are rejected',async()=>{
 clearCache();
 assert.equal(await resolveTmdbToImdb('abc'),null);
 assert.equal(await resolveTmdbToImdb(-1),null);
});
