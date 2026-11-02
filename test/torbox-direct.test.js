const {test}=require('node:test');const assert=require('node:assert/strict');
const {ready,selectFile,ticket,verifyTicket,pendingTicket,verifyPendingTicket,prepareStreams,resolvePending,requestDownloadUrl}=require('../torbox-direct');

const HASH='2c06eefc81b03b861c97292001da670f1ba4b0b2';
const TOKEN='test-secret-token';

test('ready accepts TorBox snake_case and camelCase status fields',()=>{
 assert.equal(ready({download_present:true}),true);
 assert.equal(ready({downloadPresent:true}),true);
 assert.equal(ready({download_state:'cached'}),true);
 assert.equal(ready({downloadState:'downloading'}),false);
});

test('selectFile prefers the SKTorrent filename and falls back to file index',()=>{
 const item={files:[{id:8,name:'extras/readme.txt',size:12},{id:4,name:'Kabát/Kabat koncert.mkv',size:1000}]};
 assert.deepEqual(selectFile(item,{fileIdx:1,behaviorHints:{filename:'Kabát/Kabat koncert.mkv'}}),{id:4,name:'Kabát/Kabat koncert.mkv'});
 assert.deepEqual(selectFile({files:[]},{fileIdx:7,behaviorHints:{filename:'fallback.mp4'}}),{id:7,name:'fallback.mp4'});
});

test('signed direct ticket rejects tampering',()=>{
 const t=ticket({t:123,f:4},TOKEN,60),p=verifyTicket(t,TOKEN);
 assert.equal(p.t,123);assert.equal(p.f,4);
 assert.equal(verifyTicket(t+'x',TOKEN),null);
});

test('signed pending ticket carries only hash/index/basename and rejects tampering',()=>{
 const t=pendingTicket({h:HASH,i:1,n:'Kabát/Kabat koncert.mkv'},TOKEN,60),p=verifyPendingTicket(t,TOKEN);
 assert.equal(p.h,HASH);assert.equal(p.i,1);assert.equal(p.n,'kabat koncert.mkv');
 assert.equal(verifyPendingTicket(t+'x',TOKEN),null);
});

test('ready TorBox torrent is converted to a normal HTTPS stream for Wako',async()=>{
 const fetchImpl=async(url)=>({ok:true,status:200,json:async()=>({success:true,data:[{id:123,hash:HASH,download_present:true,files:[{id:4,name:'Kabát/Kabat koncert.mkv',size:1000,mimetype:'video/x-matroska'}]}]})});
 const original={name:'SKTorrent • 1080p',title:'Kabát koncert',infoHash:HASH,fileIdx:1,behaviorHints:{filename:'Kabát/Kabat koncert.mkv'}};
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.equal(out.length,1);assert.equal(out[0].infoHash,undefined);assert.match(out[0].url,/^https:\/\/example\.test\/wako-direct\//);assert.match(out[0].name,/Direct/);
 const signed=out[0].url.split('/').pop(),p=verifyTicket(signed,TOKEN);assert.equal(p.t,123);assert.equal(p.f,4);
});

test('missing torrent is auto-added and refreshed with bypass_cache before direct conversion',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts={})=>{
  calls.push({url:String(url),method:opts.method||'GET'});
  if(String(url).includes('/createtorrent'))return {ok:true,status:200,json:async()=>({success:true,data:{torrent_id:123}})};
  if(String(url).includes('id=123')&&String(url).includes('bypass_cache=true'))return {ok:true,status:200,json:async()=>({success:true,data:{id:123,hash:HASH,download_present:true,download_state:'cached',files:[{id:4,name:'Kabát/Kabat koncert.mkv',size:1000,mime_type:'video/x-matroska'}]}})};
  return {ok:true,status:200,json:async()=>({success:true,data:[]})};
 };
 const original={name:'SKTorrent',infoHash:HASH,fileIdx:1,behaviorHints:{filename:'Kabát/Kabat koncert.mkv'}};
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.match(out[0].url,/\/wako-direct\//);
 assert.ok(calls.some(c=>c.method==='POST'&&c.url.includes('/createtorrent')));
 assert.ok(calls.some(c=>c.url.includes('bypass_cache=true')));
});

test('unfinished TorBox torrent becomes a normal pending HTTPS URL instead of infoHash fallback',async()=>{
 const fetchImpl=async()=>({ok:true,status:200,json:async()=>({success:true,data:[{id:123,hash:HASH,download_present:false,download_finished:false,download_state:'checking',files:[]}]})});
 const original={name:'SKTorrent',infoHash:HASH,fileIdx:0,behaviorHints:{filename:'Kabat concert.mkv'}};
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.equal(out[0].infoHash,undefined);assert.equal(out[0].fileIdx,undefined);
 assert.match(out[0].url,/\/wako-pending\//);assert.match(out[0].name,/Preparing/);
 const p=verifyPendingTicket(out[0].url.split('/').pop(),TOKEN);assert.equal(p.h,HASH);assert.equal(p.i,0);
});

test('resolvePending returns TorBox file once the item becomes ready',async()=>{
 let calls=0;
 const fetchImpl=async(url)=>{
  calls++;
  const isFresh=String(url).includes('bypass_cache=true');
  if(calls<3)return {ok:true,status:200,json:async()=>({success:true,data:[{id:123,hash:HASH,download_state:'checking',files:[]}]})};
  return {ok:true,status:200,json:async()=>({success:true,data:{id:123,hash:HASH,download_present:true,download_state:'cached',files:[{id:4,name:'Kabat concert.mkv',size:1000}]}})};
 };
 const target=await resolvePending(TOKEN,{h:HASH,i:0,n:'kabat concert.mkv'},{fetchImpl,attempts:3,delayMs:0});
 assert.equal(target.torrentId,123);assert.equal(target.fileId,4);assert.ok(calls>=3);
});

test('requestDownloadUrl returns only HTTPS CDN links',async()=>{
 const good=await requestDownloadUrl(TOKEN,123,4,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:true,data:'https://cdn.example/video.mkv'})})});
 assert.equal(good,'https://cdn.example/video.mkv');
 const bad=await requestDownloadUrl(TOKEN,123,4,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:true,data:'http://unsafe.example/video.mkv'})})});
 assert.equal(bad,null);
});
