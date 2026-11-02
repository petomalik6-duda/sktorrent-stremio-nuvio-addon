
// v2.1.0: optional operator-owned HTTP media registry; no cloud provider required.
const directMedia = require('./direct-streams');
const directMediaRegistry = directMedia.parseRegistry(process.env.DIRECT_STREAMS_JSON);
const directMediaStreamBase = stream;
stream = async function(req, res, c) {
 const originalJson = res.json;
 res.json = function(body) {
  if (body && Array.isArray(body.streams)) {
   body = {...body, streams: directMedia.addDirectStreams(body.streams, directMediaRegistry)};
   // Configured media URLs can expire; do not cache them across users or requests.
   res.set('Cache-Control', 'private, no-store');
  }
  return originalJson.call(this, body);
 };
 try { return await directMediaStreamBase(req, res, c); }
 finally { res.json = originalJson; }
};
const directMediaManifestBase = manifest;
manifest = function() {
 const m = directMediaManifestBase();
 return {...m, version:'2.1.0', description:m.description + ' Voliteľné priame HTTPS video zdroje bez TorBoxu; torrent fallback zostáva zachovaný.'};
};
app.get('/debug/http-stream-contract', (_q, r) => r.json({
 ok:true, version:manifest().version, directUrlConfigured:directMediaRegistry.size > 0,
 torrentFallback:true, torboxRequired:false, serverTorrentEngine:false
}));
// Preserve existing health capabilities while reporting the active release.
const directMediaHealthBase = app._router.stack.find(layer => layer.route?.path === '/health' && layer.route.methods.get)?.route.stack[0].handle;
if (directMediaHealthBase) {
 removeRoute('/health','get');
 app.get('/health', (q,r) => {
  const json=r.json;
  r.json=function(body){return json.call(this,{...body,version:'2.1.0',directHttpStreams:true,directUrlConfigured:directMediaRegistry.size>0})};
  return directMediaHealthBase(q,r);
 });
}
