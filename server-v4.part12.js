
// v1.8.5: stricter automatic movie metadata matching; no manual title mappings
function canonicalMovieMetadataTitle(raw){
 let s=displayTitle(String(raw||''));
 s=s.replace(/\[[^\]]*(?:2160p|1080p|720p|4k|uhd|web-?dl|webrip|blu-?ray|bdrip|remux|x26[45]|h\.?26[45]|cz|sk|en)[^\]]*\]/gi,' ')
   .replace(/\((?:CZ|SK|EN|CZ\/EN|SK\/EN|CZ\/SK|SK\/CZ|CZ\/SK\/EN)[^)]*\)/gi,' ')
   .replace(/\b(?:2160p|1080p|720p|4k|uhd|hdr10\+?|hdr|dolby\s*vision|dv|hevc|x265|x264|web-?dl|webrip|blu-?ray|bdrip|tvrip|remux|h\.?264|h\.?265|full\s*dvdrip|mkv|mp4)\b/gi,' ')
   .replace(/\b(?:19\d{2}|20\d{2})\b/g,' ')
   .replace(/(?:^|[\s._\-[(])(?:CZ|CZE|SK|SVK|EN|ENG)(?:\s*[/,+&]\s*(?:CZ|CZE|SK|SVK|EN|ENG))*(?=$|[\s._\-)\]])/gi,' ')
   .replace(/[._]+/g,' ')
   .replace(/\s+/g,' ')
   .replace(/^[\s\-:|/]+|[\s\-:|/]+$/g,'');
 return clean(s)
}
function metadataQueries(raw,type='movie'){
 const out=[],base=displayTitle(raw),split=base.split(/\s+(?:\/|\/\/|\|)\s+/).map(clean).filter(Boolean);
 if(type==='series'){
  uniqPush(out,canonicalSeriesTitle(base));
  for(const p of split)uniqPush(out,canonicalSeriesTitle(p));
  for(const p of split)uniqPush(out,stripSeriesNoise(p));
  uniqPush(out,stripSeriesNoise(base));
  for(const q of lookupCandidates(base))uniqPush(out,canonicalSeriesTitle(q));
 }else{
  uniqPush(out,canonicalMovieMetadataTitle(base));
  for(const p of split)uniqPush(out,canonicalMovieMetadataTitle(p));
  for(const q of lookupCandidates(base))uniqPush(out,canonicalMovieMetadataTitle(q));
 }
 return out.slice(0,8)
}
function metadataCandidateNames(hit){return[hit?.name,hit?.title,hit?.original_name,hit?.original_title].map(nm).filter(Boolean)}
function metadataHitScore(hit,q,y,type){
 const qn=nm(q);if(!qn)return-999;
 const names=metadataCandidateNames(hit);if(!names.length)return-999;
 const hy=hitYear(hit)||+String(hit.first_air_date||hit.release_date||'').slice(0,4)||null;
 // When both years are known, a clearly different release is never a safe automatic match.
 if(y&&hy&&Math.abs(y-hy)>1)return-999;
 const qw=new Set(qn.split(' ').filter(w=>w.length>1));let best=-999;
 for(const hn of names){
  const hw=new Set(hn.split(' ').filter(w=>w.length>1)),shared=[...qw].filter(w=>hw.has(w)).length,coverage=qw.size?shared/qw.size:0;
  // Do not collapse a specific title such as "Bastardi: Gde Majer?" to a generic one-word title.
  if(qw.size>=3&&(shared<2||coverage<0.66))continue;
  if(qw.size===2&&coverage<0.5)continue;
  let s=hn===qn?150:(hn.startsWith(qn)||qn.startsWith(hn)?(coverage>=0.8?105:55):(hn.includes(qn)||qn.includes(hn)?(coverage>=0.8?90:45):Math.round(coverage*75)));
  s+=Math.round(coverage*40);
  if(y&&hy)s+=Math.abs(y-hy)<=1?35:0;
  if(hit.poster||hit.poster_path)s+=5;
  if(type==='series'&&hit.type&&hit.type!=='series')s-=50;
  if(s>best)best=s
 }
 return best
}
function pickMetadataHit(arr,q,y,type){let best=null,bestScore=-999;for(const h of arr||[]){const s=metadataHitScore(h,q,y,type);if(s>bestScore){best=h;bestScore=s}}return bestScore>=80?best:null}
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.5',name:'SKTorrent Katalógy',description:'SKTorrent katalógy s prísnejším automatickým párovaním filmov, agregáciou seriálových epizód, jazykovými vlajkami, titulkami a prehrávaním.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.5',catalogs:ALL_CATS.length,strictMovieMetadataMatching:true,seriesEpisodeGrouping:true,localSeriesFallback:true,streamLanguageFlags:true,streamSubtitleInfo:true,resilientMetadataMatching:true,fullCatalogPagination:true,pageSize:PAGE_SIZE,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
app.get('/debug/metadata-title/:title',(q,r)=>{const title=String(q.params.title||'');r.json({source:title,year:yearFrom(title),queries:metadataQueries(title,'movie')})});
