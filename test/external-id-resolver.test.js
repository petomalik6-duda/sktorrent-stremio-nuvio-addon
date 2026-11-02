const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveTmdbToImdb,resolveTmdbBatchToImdb,fromTmdb,fromWikidata,clearCache}=require('../external-id-resolver');

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

test('batch resolver maps catalog IDs with TMDB preferred and one Wikidata batch fallback',async()=>{
 clearCache();
 const calls=[];
 const http={get:async(url,opts)=>{
  calls.push({url,opts});
  if(url.includes('/111/external_ids'))return{data:{imdb_id:'tt1111111'}};
  if(url.includes('/222/external_ids')||url.includes('/333/external_ids'))return{data:{imdb_id:null}};
  if(url.includes('wikidata.org'))return{data:{results:{bindings:[{tmdb:{value:'222'},imdb:{value:'tt2222222'}}]}}};
  throw new Error('unexpected '+url);
 }};
 const map=await resolveTmdbBatchToImdb([111,222,333,222,'bad'],{tmdbKey:'x',http});
 assert.equal(map.get(111),'tt1111111');
 assert.equal(map.get(222),'tt2222222');
 assert.equal(map.get(333),null);
 assert.equal(calls.filter(x=>x.url.includes('wikidata.org')).length,1);
 assert.match(calls.find(x=>x.url.includes('wikidata.org')).opts.params.query,/VALUES \?tmdb/);
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
