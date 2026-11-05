const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function makeHarness({primary=[],concertRows=[],globalRows=[],meta=null,tmdb=null}={}){
 const calls=[];
 const ctx={
  Set,Map,Promise,console,
  nm:normalize,clean:s=>String(s||'').trim(),
  nodiac:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''),
  lookupTitle:s=>String(s||'').replace(/\b(?:1080p|2160p|4k|x264|x265|mkv|mp4|webdl)\b/ig,' ').replace(/\s+/g,' ').trim(),
  targetYear:m=>Number((String(m?.releaseInfo||m?.year||'').match(/\b(?:19|20)\d{2}\b/)||[])[0]||0)||null,
  yearFrom:s=>Number((String(s||'').match(/\b(?:19|20)\d{2}\b/)||[])[0]||0)||null,
  authConfig:x=>x||{},
  standardStreamBase:x=>String(x).startsWith('tmdb:')?String(x).split(':').slice(0,2).join(':'):String(x).split(':')[0],
  isConcert:x=>String(x.category||'').toLowerCase().includes('hudebni videa'),
  targetFromStandard:async()=>meta,
  tmdbMetaByImdb:async(_type,id)=>tmdb&&id==='tt1234567'?tmdb:null,
  concertCandidatesForStandard:async()=>primary,
  searchConcertItems:async(q)=>{calls.push({kind:'concert',q});return concertRows.filter(x=>normalize(x.name).includes(normalize(q))||normalize(q).split(' ').every(w=>normalize(x.name).includes(w)))},
  searchItems:async(q)=>{calls.push({kind:'global',q});return globalRows.filter(x=>normalize(x.name).includes(normalize(q)))},
  log:()=>{}
 };
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('server-v4.part33.js','utf8'),ctx);
 return {ctx,calls};
}
const mk=(name,category='Hudebni videa',year=2025)=>({id:name.slice(0,10),name,category,year});

test('alternatively named concert matches same artist AND Krakow venue',async()=>{
 const correct=mk('Till Lindemann - Live in Kraków (2025) 1080p x265');
 const wrong=mk('Till Lindemann Live in Budapest (2025) 1080p x265');
 const {ctx}=makeHarness({concertRows:[correct,wrong]});
 const target={name:'Till Lindemann: Live in Krakow',releaseInfo:'2026'};
 const result=await ctx.concertCandidatesForStandard(target,'tt1234567',{});
 assert.equal(result.length,1);
 assert.equal(result[0].x.name,correct.name);
 assert.equal(result[0].kind,'concert-alias');
 assert.ok(result[0].s>500);
 assert.ok(ctx.strongConcertSourceScore(wrong,target)<0);
});

test('the original matched concert is kept without a second search',async()=>{
 const matched={x:mk('Janek Ledecky Symphonic'),s:999,kind:'concert'};
 const {ctx,calls}=makeHarness({primary:[matched]});
 const r=await ctx.concertCandidatesForStandard({name:'Janek Ledecky Symphonic'},'tt1234',{});
 assert.equal(r.length,1);assert.equal(r[0].s,999);assert.equal(calls.length,0);
});

test('TMDB is used as a metadata target when an IMDb film has no Cinemeta record',async()=>{
 const expected={id:'tt1234567',name:'Concert',releaseInfo:'2026'};
 const {ctx}=makeHarness({meta:null,tmdb:expected});
 assert.strictEqual(await ctx.targetFromStandard('movie','tt1234567',{}),expected);
 assert.equal(await ctx.targetFromStandard('movie','tt7654321',{}),null);
});

test('primary metadata still wins when available',async()=>{
 const a={id:'tt1234567',name:'Primary'},b={id:'tt1234567',name:'Fallback'};
 const {ctx}=makeHarness({meta:a,tmdb:b});
 assert.strictEqual(await ctx.targetFromStandard('movie','tt1234567',{}),a);
});

test('a concert in the general music category is considered but audio formats are not',()=>{
 const {ctx}=makeHarness();
 assert.equal(ctx.isConcert(mk('Till Lindemann Live in Krakow','Hudba')),true);
 assert.equal(ctx.isConcert(mk('Till Lindemann Live in Krakow FLAC','Hudba')),false);
 assert.equal(ctx.isConcert(mk('Till Lindemann Live in Krakow MP3','Hudba')),false);
 assert.equal(ctx.isConcert(mk('Till Lindemann Live in Krakow','Filmy')),false);
});

test('a single shared token does not select the wrong show',()=>{
 const {ctx}=makeHarness();
 assert.ok(ctx.strongConcertSourceScore(mk('Till Lindemann Live in Budapest'),
   {name:'Till Lindemann Live in Krakow'})<0);
 assert.ok(ctx.strongConcertSourceScore(mk('Metallica Live in Prague'),
   {name:'Adele Live in Prague'})<0);
});

test('missing dedicated category can fallback to globally indexed music video',async()=>{
 const row=mk('Bruce Springsteen Live in Prague 1080p','Hudba',2024);
 const {ctx,calls}=makeHarness({globalRows:[row]});
 const results=await ctx.concertCandidatesForStandard({name:'Bruce Springsteen Live in Prague'},'tt456',{});
 assert.equal(results.length,1);
 assert.equal(results[0].x.name,row.name);
 assert.ok(calls.some(x=>x.kind==='global'));
});
