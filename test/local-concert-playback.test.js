const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

const TID='2c06eefc81b03b861c97292001da670f1ba4b0b2';
const HASH='a'.repeat(40);

function harness(){
 const sources=new Map();
 const calls=[];
 const resources=[{name:'stream',types:['movie'],idPrefixes:['tt','tmdb:','sktc:']}];
 const env={
  BASE:'https://sktorrent.eu',
  getDirectVideoSource:(tid)=>sources.get(tid),
  rememberDirectVideoSource:(x)=>sources.set(x.id,x),
  authConfig:(c)=>c||{},
  localMeta:(_req,x,type,concert)=>({
   id:(concert?'sktc:':'skt:')+x.id,type,name:x.name,
   behaviorHints:{defaultVideoId:'sktv:'+x.id}
  }),
  resolveMeta:async(_req,x,type,config,concert)=>{
   return {id:(concert?'sktc:':'skt:')+x.id,type,name:x.name,
           behaviorHints:{defaultVideoId:'sktv:'+x.id}};
  },
  meta:async(req,res)=>res.json({meta:{id:req.params.id}}),
  stream:async(req,res)=>{
   calls.push(req.params.id);
   if(req.params.id.startsWith('sktv:')){
    const tid=req.params.id.slice(5);
    const x=sources.get(tid);
    return res.json({streams:x?[{name:'SKTorrent',infoHash:HASH,fileIdx:0,
      behaviorHints:{filename:'live-in-krakow.mkv'},source:x.downloadUrl}]:[]});
   }
   return res.json({streams:[{name:'unmodified'}]});
  },
  manifest:()=>({version:'2.2.15',resources}),
  log:()=>{}
 };
 vm.createContext(env);
 vm.runInContext(fs.readFileSync('server-v4.part32.js','utf8'),env);
 return {env,sources,calls,resources};
}
function response(){
 return {body:null,json(body){this.body=body;return this}};
}

test('local concert metadata preserves its own playback ID, standard IDs remain untouched',async()=>{
 const {env,sources}=harness();
 const x={id:TID,name:'Till Lindemann Live in Krakow',category:'Hudební videa',
   downloadUrl:'https://sktorrent.eu/torrent/download.php?id='+TID};
 const result=await env.resolveMeta({},x,'movie',{},true);
 assert.equal(result.id,'sktc:'+TID);
 assert.equal(result.behaviorHints.defaultVideoId,'sktc:'+TID);
 assert.equal(sources.get(TID),x);
 const standard=await env.resolveMeta({},x,'movie',{},false);
 assert.equal(standard.behaviorHints.defaultVideoId,'sktv:'+TID);
});

test('local concert detail returns stable ID and a usable defaultVideoId',async()=>{
 const {env}=harness();
 const res=response();
 await env.meta({params:{type:'movie',id:'sktc:'+TID}},res,{});
 assert.equal(res.body.meta.id,'sktc:'+TID);
 assert.equal(res.body.meta.behaviorHints.defaultVideoId,'sktc:'+TID);
 assert.equal(res.body.meta.type,'movie');
 assert.equal(res.body.meta.name,'SKTorrent koncert');
});

test('local concert stream uses the stable ID and returns single fileIdx 0 after cache loss',async()=>{
 const {env,calls}=harness();
 const req={params:{type:'movie',id:'sktc:'+TID}},res=response();
 await env.stream(req,res,{});
 assert.deepEqual(calls,['sktv:'+TID]);
 assert.equal(req.params.id,'sktc:'+TID,'original request must be restored');
 assert.equal(res.body.streams.length,1);
 assert.equal(res.body.streams[0].fileIdx,0);
 assert.equal(res.body.streams[0].infoHash,HASH);
 assert.match(res.body.streams[0].source,/download\.php\?id=/);
});

test('standard stream requests pass through and keep the manifest resources unchanged',async()=>{
 const {env,calls,resources}=harness();
 const req={params:{type:'movie',id:'tt1234567'}},res=response();
 await env.stream(req,res,{});
 assert.deepEqual(calls,['tt1234567']);
 assert.equal(res.body.streams[0].name,'unmodified');
 assert.equal(req.params.id,'tt1234567');
 assert.strictEqual(env.manifest().resources,resources);
 assert.equal(env.manifest().version,'2.2.15');
});

test('invalid local IDs cannot be used as torrent download paths',async()=>{
 const {env,calls,sources}=harness();
 const req={params:{type:'movie',id:'sktc:../../private'}},res=response();
 await env.stream(req,res,{});
 assert.equal(req.params.id,'sktc:../../private');
 assert.deepEqual(calls,['sktc:../../private']);
 assert.equal(sources.size,0);
});
