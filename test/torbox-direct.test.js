const {test}=require('node:test');const assert=require('node:assert/strict');
const {ready,selectFile,ticket,verifyTicket,prepareStreams,requestDownloadUrl}=require('../torbox-direct');

const HASH='2c06eefc81b03b861c97292001da670f1ba4b0b2';
const TOKEN='test-secret-token';
const TORRENT=Buffer.from('test-private-torrent-bytes');
function withTorrentBuffer(stream){Object.defineProperty(stream,'_sktTorrentBuffer',{value:TORRENT,enumerable:false});return stream}

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

test('ready TorBox torrent is converted to normal HTTPS Direct stream',async()=>{
 const fetchImpl=async()=>({ok:true,status:200,json:async()=>({success:true,data:[{id:123,hash:HASH,download_present:true,files:[{id:4,name:'Kabát/Kabat koncert.mkv',size:1000,mimetype:'video/x-matroska'}]}]})});
 const original={name:'SKTorrent • 1080p',title:'Kabát koncert',infoHash:HASH,fileIdx:1,behaviorHints:{filename:'Kabát/Kabat koncert.mkv'}};
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.equal(out.length,1);assert.equal(out[0].infoHash,undefined);assert.match(out[0].url,/^https:\/\/example\.test\/wako-direct\//);assert.match(out[0].name,/Direct/);
 const signed=out[0].url.split('/').pop(),p=verifyTicket(signed,TOKEN);assert.equal(p.t,123);assert.equal(p.f,4);
});

test('missing torrent is uploaded as real .torrent file and can become Direct immediately',async()=>{
 const calls=[];
 const fetchImpl=async(url,opts={})=>{
  const u=String(url);calls.push({url:u,method:opts.method||'GET',body:opts.body});
  if(u.includes('/createtorrent'))return {ok:true,status:200,json:async()=>({success:true,data:{torrent_id:123}})};
  if(u.includes('id=123')&&u.includes('bypass_cache=true'))return {ok:true,status:200,json:async()=>({success:true,data:{id:123,hash:HASH,download_present:true,download_state:'cached',files:[{id:4,name:'Kabát/Kabat koncert.mkv',size:1000,mime_type:'video/x-matroska'}]}})};
  return {ok:true,status:200,json:async()=>({success:true,data:[]})};
 };
 const original=withTorrentBuffer({name:'SKTorrent',infoHash:HASH,fileIdx:1,behaviorHints:{filename:'Kabát/Kabat koncert.mkv'}});
 assert.equal(JSON.stringify(original).includes('_sktTorrentBuffer'),false);
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.match(out[0].url,/\/wako-direct\//);
 const create=calls.find(c=>c.method==='POST'&&c.url.includes('/createtorrent'));
 assert.ok(create);assert.ok(create.body.get('file'));assert.equal(create.body.get('magnet'),null);
 assert.ok(calls.some(c=>c.url.includes('bypass_cache=true')));
});

test('stuck checking item with zero files is replaced using the real .torrent file',async()=>{
 const calls=[];
 const checking={id:123,hash:HASH,download_present:false,download_state:'checking',files:[]};
 const fetchImpl=async(url,opts={})=>{
  const u=String(url),method=opts.method||'GET';calls.push({url:u,method,body:opts.body});
  if(u.includes('/controltorrent'))return {ok:true,status:200,json:async()=>({success:true,data:true})};
  if(u.includes('/createtorrent'))return {ok:true,status:200,json:async()=>({success:true,data:{torrent_id:124}})};
  if(u.includes('id=124')&&u.includes('bypass_cache=true'))return {ok:true,status:200,json:async()=>({success:true,data:{id:124,hash:HASH,download_present:true,download_state:'cached',files:[{id:4,name:'Kabat concert.mkv',size:1000}]}})};
  if(u.includes('id=123'))return {ok:true,status:200,json:async()=>({success:true,data:checking})};
  return {ok:true,status:200,json:async()=>({success:true,data:[checking]})};
 };
 const original=withTorrentBuffer({name:'SKTorrent',infoHash:HASH,fileIdx:0,behaviorHints:{filename:'Kabat concert.mkv'}});
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.match(out[0].url,/\/wako-direct\//);
 assert.ok(calls.some(c=>c.method==='POST'&&c.url.includes('/controltorrent')));
 const create=calls.find(c=>c.method==='POST'&&c.url.includes('/createtorrent'));
 assert.ok(create?.body.get('file'));assert.equal(create.body.get('magnet'),null);
});

test('unfinished TorBox item keeps original SKTorrent infoHash fallback visible',async()=>{
 const fetchImpl=async()=>({ok:true,status:200,json:async()=>({success:true,data:[{id:555,hash:HASH,download_present:false,download_finished:false,download_state:'downloading',files:[]}]})});
 const original={name:'SKTorrent',infoHash:HASH,fileIdx:0};
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.equal(out[0],original);assert.equal(out[0].infoHash,HASH);assert.equal(out[0].url,undefined);
});

test('requestDownloadUrl returns only HTTPS CDN links',async()=>{
 const good=await requestDownloadUrl(TOKEN,123,4,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:true,data:'https://cdn.example/video.mkv'})})});
 assert.equal(good,'https://cdn.example/video.mkv');
 const bad=await requestDownloadUrl(TOKEN,123,4,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:true,data:'http://unsafe.example/video.mkv'})})});
 assert.equal(bad,null);
});
