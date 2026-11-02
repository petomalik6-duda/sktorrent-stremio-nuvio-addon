const {test}=require('node:test');const assert=require('node:assert/strict');
const {selectFile,ticket,verifyTicket,prepareStreams,requestDownloadUrl}=require('../torbox-direct');

const HASH='2c06eefc81b03b861c97292001da670f1ba4b0b2';
const TOKEN='test-secret-token';

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

test('ready TorBox torrent is converted to a normal HTTPS stream for Wako',async()=>{
 const fetchImpl=async(url)=>({ok:true,status:200,json:async()=>({success:true,data:[{id:123,hash:HASH,downloadPresent:true,files:[{id:4,name:'Kabát/Kabat koncert.mkv',size:1000,mimetype:'video/x-matroska'}]}]})});
 const original={name:'SKTorrent • 1080p',title:'Kabát koncert',infoHash:HASH,fileIdx:1,behaviorHints:{filename:'Kabát/Kabat koncert.mkv'}};
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.equal(out.length,1);assert.equal(out[0].infoHash,undefined);assert.match(out[0].url,/^https:\/\/example\.test\/wako-direct\//);assert.match(out[0].name,/Direct/);
 const signed=out[0].url.split('/').pop(),p=verifyTicket(signed,TOKEN);assert.equal(p.t,123);assert.equal(p.f,4);
});

test('unfinished TorBox torrent keeps torrent fallback',async()=>{
 const fetchImpl=async()=>({ok:true,status:200,json:async()=>({success:true,data:[{id:123,hash:HASH,downloadPresent:false,downloadFinished:false,downloadState:'downloading',files:[]}]})});
 const original={name:'SKTorrent',infoHash:HASH,fileIdx:0};
 const out=await prepareStreams([original],{token:TOKEN,publicBase:'https://example.test',fetchImpl});
 assert.equal(out[0],original);
});

test('requestDownloadUrl returns only HTTPS CDN links',async()=>{
 const good=await requestDownloadUrl(TOKEN,123,4,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:true,data:'https://cdn.example/video.mkv'})})});
 assert.equal(good,'https://cdn.example/video.mkv');
 const bad=await requestDownloadUrl(TOKEN,123,4,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({success:true,data:'http://unsafe.example/video.mkv'})})});
 assert.equal(bad,null);
});
