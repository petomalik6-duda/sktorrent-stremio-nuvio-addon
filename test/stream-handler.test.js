const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const direct=require('../direct-streams');
const hash='b'.repeat(40);
test('final stream wrapper covers standard, local and People IDs without changing manifest resources',async()=>{
 const input={name:'sample',infoHash:hash,fileIdx:0,behaviorHints:{filename:'video.mp4'}};
 const routes={};
 const resources=[{name:'stream',types:['movie'],idPrefixes:['tt','sktc:','person-credit:']}];
 const context={require:()=>direct,process:{env:{DIRECT_STREAMS_JSON:JSON.stringify({[`${hash}:0`]:'https://media.example.com/video.mp4'})}},
  stream:async(req,res)=>res.json({streams:[input]}),manifest:()=>({resources,description:'Original'}),app:{_router:{stack:[]},get:(p,h)=>routes[p]=h}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('server-v4.part29.js','utf8'),context);
 for(const id of ['tt123','tt123:1:2','sktc:123','person-credit:123']) {
  let body,header;const res={json(x){body=x;return this},set(k,v){header=[k,v]}};const original=res.json;
  await context.stream({params:{id}},res,{});
  assert.equal(body.streams[0].url,'https://media.example.com/video.mp4');
  assert.strictEqual(body.streams[1],input);assert.strictEqual(res.json,original);
  assert.deepEqual(header,['Cache-Control','private, no-store']);
 }
 assert.strictEqual(context.manifest().resources,resources);assert.equal(context.manifest().version,'2.1.0');
});
