const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
function year(s){return Number((String(s||'').match(/\b(?:19|20)\d{2}\b/)||[])[0])||null}
function harness({sourceName='Koncert: Queen Live at Wembley Stadium 1986 1080p EN',
  sourceYear=null, cine=[],tmdb=[],baseCine=null,baseTmdb=null,tmdbKey='token'}={}){
 const history=[],cache=new Map();
 const source={id:'200',name:sourceName,year:sourceYear,category:'Hudební videa'};
 const env={
  Set,Map,Promise,console,process:{env:{}},
  displayTitle:x=>String(x||''),
  clean:s=>String(s||'').trim().replace(/\s+/g,' '),
  nm:normalize,nodiac:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''),
  isConcert:x=>String(x?.category||'').includes('Hudební videa'),
  yearFrom:year,
  hitYear:o=>year(o?.releaseInfo||o?.year||o?.release_date),
  movieProviderYear:o=>year(o?.releaseInfo||o?.year||o?.release_date),
  concertMatchScore:()=>-999,
  metadataQueries:s=>[s],
  findConcertCinemeta:async()=>baseCine,
  cinemetaSearch:async(_type,q)=>{history.push(['cine',q]);return cine.filter(v=>normalize(q)===normalize(v.searchFor||v.name))},
  tmdbSearch:async()=>baseTmdb,
  metadataGet:async(url,config)=>{
   if(url.endsWith('external_ids')){history.push(['external',url]);return {data:{imdb_id:'tt9990001'}}}
   history.push(['tmdb',config.params.query]);
   return {data:{results:tmdb.filter(v=>normalize(config.params.query)===normalize(v.searchFor||v.title))}}
  },
  perfV2KeyFingerprint:()=> 'fingerprint',
  successfulCacheGet:k=>cache.get(k)||null,
  successfulCacheSet:(k,v)=>{cache.set(k,v);return v},
  resolveMeta:async(_req,x)=>({id:'sktc:'+x.id,type:'movie',name:x.name}),
  rememberConcertLink:()=>{},rememberStandardSourceLink:()=>{},rememberDirectVideoSource:()=>{},
  log:()=>{}
 };
 vm.createContext(env);
 vm.runInContext(fs.readFileSync('server-v4.part34.js','utf8'),env);
 vm.runInContext(fs.readFileSync('server-v4.part35.js','utf8'),env);
 return {env,source,history,config:{tmdbKey}}
}

test('generic Cinemeta accepts Queen Wembley when release year is a trailing suffix',async()=>{
 const h=harness({cine:[{id:'tt101010',name:'Queen: Live at Wembley Stadium',
  releaseInfo:'1986',searchFor:'Queen Live at Wembley Stadium'}]});
 const m=await h.env.findConcertCinemeta(h.source);
 assert.equal(m?.id,'tt101010');
 assert.ok(h.history.some(([p,q])=>p==='cine'&&normalize(q)==='queen live at wembley stadium'));
});

test('generic TMDB accepts a concert and retrieves IMDb external id',async()=>{
 const h=harness({sourceName:'Koncert: Elvis Aloha from Hawaii 1973 720p EN',
   tmdb:[{id:41,title:'Elvis: Aloha from Hawaii',release_date:'1973-01-01',
    searchFor:'Elvis Aloha from Hawaii'}]});
 const m=await h.env.tmdbSearch(h.source,'movie',h.config,true);
 assert.equal(m?.id,41);
 assert.equal(m?.imdb,'tt9990001');
 assert.ok(h.history.some(([p])=>p==='external'));
});

test('ambiguous same-title external IDs do not overwrite local identity',async()=>{
 const h=harness({cine:[
  {id:'tt101010',name:'Queen Live at Wembley Stadium',releaseInfo:'1986',searchFor:'Queen Live at Wembley Stadium'},
  {id:'tt202020',name:'Queen Live at Wembley Stadium',releaseInfo:'1986',searchFor:'Queen Live at Wembley Stadium'}
 ]});
 assert.equal(await h.env.findConcertCinemeta(h.source),null);
});

test('wrong artist, wrong venue and incompatible year are rejected',async()=>{
 const h=harness();
 const wrongArtist={id:'tt3',name:'Metallica Live at Wembley Stadium',releaseInfo:'1986'};
 const wrongVenue={id:'tt4',name:'Queen Live in Budapest',releaseInfo:'1986'};
 const wrongYear={id:'tt5',name:'Queen Live at Wembley Stadium',releaseInfo:'2024'};
 assert.ok(h.env.concertGenericMatchScore(h.source,wrongArtist)<0);
 assert.ok(h.env.concertGenericMatchScore(h.source,wrongVenue)<0);
 assert.ok(h.env.concertGenericMatchScore(h.source,wrongYear)<0);
});

test('a missing TMDB API key retains local identity rather than inventing a standard ID',async()=>{
 const h=harness();
 assert.equal(await h.env.tmdbSearch(h.source,'movie',{},true),null);
});

test('existing safe provider identification is retained without additional requests',async()=>{
 const hit={id:'tt123456',name:'Queen Live at Wembley Stadium',releaseInfo:'1986'};
 const h=harness({baseCine:hit});
 assert.strictEqual(await h.env.findConcertCinemeta(h.source),hit);
 assert.deepEqual(h.history,[]);
});

test('series and unrelated movies keep the original matcher',async()=>{
 const h=harness({baseTmdb:{id:9,title:'Unrelated Movie'},tmdbKey:'token'});
 const got=await h.env.tmdbSearch(h.source,'series',h.config,false);
 assert.equal(got.id,9);
 const movie={id:'1',name:'A normal movie',category:'Films'};
 assert.equal(await h.env.findConcertCinemeta(movie),null);
});

test('Dolly Opry release still matches the correct IMDb film',async()=>{
 const h=harness({sourceName:'Koncert: Dolly Parton 50 Years at the Opry 720p EN TV-Rip',
   cine:[{id:'tt11229774',name:'Dolly Parton: 50 Years at the Opry',
    releaseInfo:'2019',searchFor:'Dolly Parton 50 Years at the Opry'}]});
 assert.equal((await h.env.findConcertCinemeta(h.source))?.id,'tt11229774');
});
