
// v2.2.15 hotfix: make locally identified concerts resolvable across Stremio,
// AIOStreams' Jellyfin media server and other clients.
// A local catalog item has id sktc:<torrentId>. Previously its defaultVideoId
// could be rewritten to sktv:<torrentId>, and both local routes depended on
// scanning recent listings; older concerts then returned no streams.
// Preserve the existing tt/tmdb and Wako/TorBox paths.

function localConcertTorrentId(value) {
 const m=String(value||'').match(/^sktc:([a-zA-Z0-9_-]{1,100})$/);
 return m?m[1]:null;
}
function localConcertSourceById(tid) {
 if(typeof tid!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(tid))return null;
 const hit=getDirectVideoSource(tid);
 if(hit)return hit;
 // No cross-user source cache or recent-listing dependency is required:
 // SKTorrent's torrent endpoint is already addressed by its source ID.
 return {
  id:tid,
  name:'SKTorrent koncert',
  category:'Hudební videa',
  size:'?',seeds:0,
  detailUrl:BASE+'/torrent/details.php?id='+encodeURIComponent(tid),
  downloadUrl:BASE+'/torrent/download.php?id='+encodeURIComponent(tid)
 };
}

const localConcertResolveMetaBase=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false) {
 const m=await localConcertResolveMetaBase(req,x,type,c,concert);
 if(m&&type==='movie'&&concert&&x?.id) {
  rememberDirectVideoSource(x);
  // Only local concerts get an explicit local video ID. Standard tt/tmdb
  // metadata remains untouched so other stream addons can be aggregated.
  if(m.id==='sktc:'+x.id) {
   m.behaviorHints={...(m.behaviorHints||{}),defaultVideoId:m.id};
  }
 }
 return m
};

const localConcertMetaBase=meta;
meta=async function(req,res,c) {
 const tid=req.params?.type==='movie'?localConcertTorrentId(req.params.id):null;
 if(!tid)return localConcertMetaBase(req,res,c);
 const x=localConcertSourceById(tid);
 if(!x)return res.json({meta:null});
 rememberDirectVideoSource(x);
 let m=null;
 try {
  // An item opened directly from a catalog keeps the original name/poster.
  // If the server has restarted, return honest local metadata rather than
  // inventing an IMDb/TMDB match for an unknown title.
  if(x.name!=='SKTorrent koncert')m=await resolveMeta(req,x,'movie',authConfig(c),true);
 }catch(e){log('local concert metadata fallback',tid,e.message)}
 if(!m)m=localMeta(req,x,'movie',true);
 m={...m,id:'sktc:'+tid,type:'movie'};
 delete m.videos;
 delete m.streams;
 m.behaviorHints={...(m.behaviorHints||{}),defaultVideoId:m.id};
 return res.json({meta:m})
};

const localConcertStreamBase=stream;
stream=async function(req,res,c) {
 const tid=req.params?.type==='movie'?localConcertTorrentId(req.params.id):null;
 if(!tid)return localConcertStreamBase(req,res,c);
 const x=localConcertSourceById(tid);
 if(!x)return res.json({streams:[]});
 rememberDirectVideoSource(x);
 // Delegate through the existing sktv branch, keeping the final stream
 // wrappers intact (direct URL registry and Wako/TorBox integration).
 const originalId=req.params.id;
 req.params.id='sktv:'+tid;
 try{return await localConcertStreamBase(req,res,c)}
 finally{req.params.id=originalId}
};

