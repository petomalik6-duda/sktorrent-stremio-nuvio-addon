const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseRegistry, addDirectStreams} = require('../direct-streams');
const hash = 'a'.repeat(40), source = {name:'SKTorrent', title:'Episode', infoHash:hash,fileIdx:2,behaviorHints:{filename:'S01E02.mkv',bingeGroup:'series'}};
test('disabled registry preserves exact fallback fields and order',()=>{
 assert.deepEqual(addDirectStreams([source],parseRegistry()),[source]);
});
test('direct stream is separate, first, correctly hinted and exact-file matched',()=>{
 const registry=parseRegistry(JSON.stringify({[`${hash}:2`]:'https://media.example.com/episode.mkv'}));
 const result=addDirectStreams([source,{...source,fileIdx:3}],registry);
 assert.equal(result.length,3);assert.equal(result[0].url,'https://media.example.com/episode.mkv');
 assert.equal(result[0].infoHash,undefined);assert.equal(result[0].fileIdx,undefined);
 assert.equal(result[0].behaviorHints.notWebReady,true);assert.equal(result[0].behaviorHints.filename,'S01E02.mkv');
 assert.strictEqual(result[1],source);
});
test('MP4 hints and hash case normalization',()=>{
 const registry=parseRegistry(JSON.stringify({[`${hash}:2`]:'https://media.example.com/video.mp4?signature=x'}));
 assert.equal(addDirectStreams([{...source,infoHash:hash.toUpperCase()}],registry)[0].behaviorHints.notWebReady,false);
});
test('malformed, ambiguous or unsafe configurations fail without leaking URLs',()=>{
 for(const raw of ['null','[]','broken',JSON.stringify({'bad':'https://media.example.com/x'})]) assert.throws(()=>parseRegistry(raw));
 for(const url of ['http://media.example.com/x','magnet:?xt=x','https://user:secret@media.example.com/x','https://127.0.0.1/x','https://[::1]/x','https://localhost/x','https://media.local/x','https://sktorrent.eu/torrent/download.php?id=1','https://media.example.com/a.torrent']) {
  assert.throws(()=>parseRegistry(JSON.stringify({[`${hash}:2`]:url})),/Unsafe direct stream URL/);
 }
});
test('no direct URL for unknown files, error external links or missing index',()=>{
 const registry=parseRegistry(JSON.stringify({[`${hash}:2`]:'https://media.example.com/x.mp4'}));
 const items=[{externalUrl:'https://sktorrent.eu/'},{infoHash:hash},{...source,fileIdx:-1}];
 assert.deepEqual(addDirectStreams(items,registry),items);
});
test('duplicates do not duplicate direct entries or remove original fallbacks',()=>{
 const registry=parseRegistry(JSON.stringify({[`${hash}:2`]:'https://media.example.com/x.mp4'}));
 assert.equal(addDirectStreams([source,source],registry).length,3);
});
