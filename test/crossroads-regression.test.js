const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function harness() {
 const changes=[];
 const ctx={
  log:(...args)=>changes.push(args),
  displayTitle:s=>String(s||''),
  cleanConcertReleaseTitle:s=>String(s||'')
   .replace(/^(?:Koncert|Concert)\s*:\s*/i,'')
   .replace(/\s+\b(?:720p|1080p|2160p)\b.*$/i,'').trim(),
  isDollyPartonOpry50:x=>/dolly\s+parton.*50.*opry/i.test(x?.name||''),
  resolveMeta:async(_req,x,type,_c,concert)=>{
   if(concert){
    const id=x.externalId||'sktc:'+x.id;
    return {id,type,name:'Crossroads Festival',poster:'cover',description:'Full description',
      behaviorHints:id.startsWith('sktc:')?{defaultVideoId:id}:undefined};
   }
   return {id:'ttmovie',type,name:'Other Movie'}
  }
 };
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('server-v4.part36.js','utf8'),ctx);
 return {ctx,changes}
}

test('Eric Clapton Crossroads retains SKTorrent title instead of generic Crossroads Festival',async()=>{
 const {ctx}=harness();
 const x={id:'123',name:'Koncert: Eric Clapton Crossroads Guitar Festival 2013 1080p',
  externalId:'tt3108322'};
 const m=await ctx.resolveMeta({},x,'movie',{},true);
 assert.equal(m.name,'Eric Clapton Crossroads Guitar Festival 2013');
 assert.equal(m.id,'tt3108322');
 assert.equal(m.poster,'cover');
 assert.equal(m.description,'Full description');
});

test('different Crossroads years preserve distinct names, IDs and playback hints',async()=>{
 const {ctx}=harness();
 const p2004=await ctx.resolveMeta({},{
  id:'2004',name:'Eric Clapton Crossroads Guitar Festival 2004',
  externalId:'tt0439523'},'movie',{},true);
 const p2013=await ctx.resolveMeta({},{
  id:'2013',name:'Eric Clapton Crossroads Guitar Festival 2013',
  externalId:'tt3108322'},'movie',{},true);
 assert.notEqual(p2004.name,p2013.name);
 assert.equal(p2004.id,'tt0439523');
 assert.equal(p2013.id,'tt3108322');
 const local=await ctx.resolveMeta({},{
  id:'777',name:'Eric Clapton Crossroads Concert 2007'},'movie',{},true);
 assert.equal(local.name,'Eric Clapton Crossroads Concert 2007');
 assert.equal(local.id,'sktc:777');
 assert.equal(local.behaviorHints.defaultVideoId,'sktc:777');
});

test('Dolly provider-verified identity retains the previous official name',async()=>{
 const {ctx}=harness();
 const m=await ctx.resolveMeta({},{
  id:'888',name:'Koncert: Dolly Parton 50 Years at the Opry 720p',
  externalId:'tt11229774'},'movie',{},true);
 assert.equal(m.name,'Crossroads Festival','leave previous verified metadata untouched');
 assert.equal(m.id,'tt11229774');
});

test('normal films and series metadata are unaffected',async()=>{
 const {ctx}=harness();
 const film=await ctx.resolveMeta({},{
  id:'film',name:'Some Film 1080p'},'movie',{},false);
 const series=await ctx.resolveMeta({},{
  id:'series',name:'A Series'},'series',{},false);
 assert.equal(film.name,'Other Movie');
 assert.equal(series.name,'Other Movie');
});

test('application startup no longer loads aggressive universal concert matching',()=>{
 const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
 for(const action of ['start','check']){
  assert.ok(pkg.scripts[action].includes('server-v4.part34.js'));
  assert.ok(pkg.scripts[action].includes('server-v4.part36.js'));
  assert.ok(!pkg.scripts[action].includes('server-v4.part35.js'));
 }
});
