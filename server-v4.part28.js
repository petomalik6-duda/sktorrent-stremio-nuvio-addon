
// v2.0.2: restore the local concert fallback contract.
// Concert catalog items that cannot be mapped safely to IMDb/TMDB keep an
// sktc:<torrentId> identity. The meta() and stream() handlers already support
// this identity, but the v2 manifest stopped advertising it, so Stremio/Nuvio
// would show the catalog card and then refuse/skip detail and stream requests.
const PERF_V202_MANIFEST_BASE=manifest;
function perfV202AddPrefix(values,prefix){return [...new Set([...(Array.isArray(values)?values:[]),prefix])]} 
manifest=function(){
 const m=PERF_V202_MANIFEST_BASE();
 m.version='2.0.2';
 m.description=String(m.description||'SKTorrent Katalógy')+' Opravený lokálny fallback koncertov (sktc:) pre detail a stream.';
 m.idPrefixes=perfV202AddPrefix(m.idPrefixes,'sktc:');
 m.resources=(m.resources||[]).map(r=>{
  if(!r||typeof r!=='object'||!['meta','stream'].includes(r.name))return r;
  const types=Array.isArray(r.types)?r.types:[];
  if(!types.includes('movie'))return r;
  return {...r,idPrefixes:perfV202AddPrefix(r.idPrefixes,'sktc:')}
 });
 return m
};

app.get('/debug/concert-contract',(_q,r)=>{
 const m=manifest(),movieMeta=(m.resources||[]).find(x=>x?.name==='meta'&&x.types?.includes('movie')),movieStream=(m.resources||[]).find(x=>x?.name==='stream'&&x.types?.includes('movie'));
 r.json({ok:Boolean(movieMeta?.idPrefixes?.includes('sktc:')&&movieStream?.idPrefixes?.includes('sktc:')),version:m.version,manifestIdPrefixes:m.idPrefixes,movieMetaPrefixes:movieMeta?.idPrefixes||[],movieStreamPrefixes:movieStream?.idPrefixes||[]})
});
