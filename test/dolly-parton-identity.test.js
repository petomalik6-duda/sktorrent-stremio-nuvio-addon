const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const SOURCE={
 id:'98765',name:'Koncert: Dolly Parton 50 Years at the Opry 720p EN TV-Rip',
 category:'Hudební videa',year:null,poster:'https://example.test/dolly.jpg'
};
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function harness({metaId='sktc:98765',cine=[]}={}){
 const links=[];
 const target={name:'Dolly Parton: 50 Years at the Opry',id:'tt11229774',releaseInfo:'2019'};
 const env={
  Set,Map,Promise,console,
  displayTitle:x=>String(x||''),
  clean:x=>String(x||'').trim().replace(/\s+/g,' '),
  nm:normalize,
  isConcert:x=>normalize(x.category).includes('hudebni videa'),
  yearFrom:s=>Number((String(s).match(/\b(?:19|20)\d{2}\b/)||[])[0]||0)||null,
  hitYear:x=>Number((String(x.releaseInfo||x.year||'').match(/\b(?:19|20)\d{2}\b/)||[])[0]||0)||null,
  movieProviderYear:x=>Number((String(x.releaseInfo||x.year||'').match(/\b(?:19|20)\d{2}\b/)||[])[0]||0)||null,
  concertMatchScore:()=>-999,
  metadataQueries:(s)=>[s],
  findConcertCinemeta:async()=>null,
  cinemetaSearch:async()=>cine,
  resolveMeta:async(_req,x)=>({
   id:metaId,type:'movie',name:x.name,
   behaviorHints:{defaultVideoId:metaId},
   poster:x.poster
  }),
  rememberConcertLink:(id,x)=>links.push(['concert',id,x]),
  rememberStandardSourceLink:(id,x)=>links.push(['standard',id,x]),
  rememberDirectVideoSource:(x)=>links.push(['direct',x.id,x]),
  log:()=>{}
 };
 vm.createContext(env);
 vm.runInContext(fs.readFileSync('server-v4.part34.js','utf8'),env);
 return {env,links,target}
}

test('the exact SKTorrent Dolly release matches IMDb title despite Koncert / TV-Rip',()=>{
 const {env,target}=harness();
 const score=env.concertMatchScore(SOURCE,target);
 assert.ok(score>=80,'match score '+score);
 assert.equal(env.cleanConcertReleaseTitle(SOURCE.name),'Dolly Parton 50 Years at the Opry');
 assert.deepEqual(Array.from(env.concertReleaseWords(SOURCE.name)),['dolly','parton','50','years','opry']);
});

test('Cinemeta and TMDB receive the clean title before the raw release name',async()=>{
 const {env,target}=harness({cine:[{...target}]});
 const queries=env.metadataQueries(SOURCE.name,'movie');
 assert.equal(queries[0],'Dolly Parton 50 Years at the Opry');
 assert.equal((await env.findConcertCinemeta(SOURCE)).id,'tt11229774');
 assert.equal(env.metadataQueries(SOURCE.name,'series')[0],SOURCE.name);
});

test('other Dolly anniversary concerts are not accidentally matched to the Opry',()=>{
 const {env}=harness();
 const wrong={name:'Dolly Parton: 50 Years on Stage',releaseInfo:'2019'};
 assert.ok(env.concertMatchScore(SOURCE,wrong)<0);
 assert.ok(env.concertMatchScore(SOURCE,{name:'Dolly Parton Live in London'})<0);
});

test('when provider lookup fails, verified Dolly Opry item uses shared IMDb ID',async()=>{
 const {env,links}=harness();
 const m=await env.resolveMeta({},SOURCE,'movie',{},true);
 assert.equal(m.id,'tt11229774');
 assert.equal(m.name,'Dolly Parton: 50 Years at the Opry');
 assert.equal(m.releaseInfo,'2019');
 assert.equal(m.poster,SOURCE.poster);
 assert.ok(!m.behaviorHints?.defaultVideoId);
 assert.deepEqual(links.filter(x=>x[0]==='standard').map(x=>x[1]),['tt11229774']);
});

test('non-Dolly local concerts and standard movies remain unchanged',async()=>{
 const {env}=harness();
 const other={...SOURCE,name:'Koncert: Adele Live at Royal Albert Hall 720p'};
 const m=await env.resolveMeta({},other,'movie',{},true);
 assert.equal(m.id,'sktc:98765');
 const movie=await env.resolveMeta({},SOURCE,'movie',{},false);
 assert.equal(movie.id,'sktc:98765');
});

test('a misdated or similarly titled Dolly recording cannot receive the 2019 ID',async()=>{
 const {env}=harness();
 const other={...SOURCE,year:2024};
 assert.equal((await env.resolveMeta({},other,'movie',{},true)).id,'sktc:98765');
 const wrong={...SOURCE,name:'Koncert: Dolly Parton 50 Years at the Hollywood Bowl 720p'};
 assert.equal((await env.resolveMeta({},wrong,'movie',{},true)).id,'sktc:98765');
});

test('valid provider-assigned standard IDs are preserved',async()=>{
 const {env}=harness({metaId:'tmdb:651555'});
 assert.equal((await env.resolveMeta({},SOURCE,'movie',{},true)).id,'tmdb:651555');
});
