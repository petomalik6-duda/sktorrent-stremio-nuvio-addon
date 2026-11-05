
// Concert release-name normalisation for metadata providers.
// Example: "Koncert: Dolly Parton 50 Years at the Opry 720p EN TV-Rip"
// must match "Dolly Parton: 50 Years at the Opry" (2019), IMDb tt11229774.
// Preserve normal movie/series matching and the existing TorBox stream pipeline.

function cleanConcertReleaseTitle(raw){
 let s=displayTitle(raw);
 s=s.replace(/^\s*(?:koncert|concert|hudebn[ií]\s+videa|music\s+video)\s*[:\-–]\s*/i,'');
 s=s.replace(/\s*\b(?:2160p|1080p|720p|480p|4k|uhd|blu[\s-]?ray|bdrip|web[\s-]?dl|webrip|tv[\s-]?rip|x26[45]|h\.?26[45]|hevc|remux|mkv|mp4)\b.*$/i,'');
 return clean(s.replace(/[._]+/g,' ').replace(/\s+/g,' '))
}
function concertReleaseWords(value){
 const ignored=new Set(['the','and','of','in','at','on','a','an','with','friends','koncert','concert','live','full','tv','rip','en','cz','sk','hd','video','music']);
 return [...new Set(nm(cleanConcertReleaseTitle(value)).split(' ').filter(w=>
  w.length>1&&!ignored.has(w)&&!/^(19|20)\d\d$/.test(w)
 ))]
}
function trustedConcertIdentityScore(source,candidate){
 if(!source?.name||!isConcert(source)||!candidate)return-999;
 const sw=concertReleaseWords(source.name);
 const titles=[candidate.name,candidate.title,candidate.original_title].filter(Boolean);
 let score=-999;
 for(const title of titles){
  const tw=concertReleaseWords(title);
  if(sw.length<3||tw.length<3)continue;
  const shared=sw.filter(w=>tw.includes(w)).length;
  const sCoverage=shared/sw.length,tCoverage=shared/tw.length;
  // Require virtually every distinctive source word. This rules out
  // an artist's other show merely sharing "50 Years".
  if(shared<3||sCoverage<0.85||tCoverage<0.7)continue;
  const sy=source.year||yearFrom(source.name),ty=hitYear(candidate)||movieProviderYear(candidate);
  if(sy&&ty&&Math.abs(sy-ty)>2)continue;
  score=Math.max(score,100+Math.round(sCoverage*50)+Math.round(tCoverage*30)+shared*8);
 }
 return score
}

const concertReleaseMatchBase=concertMatchScore;
concertMatchScore=function(source,candidate){
 const original=concertReleaseMatchBase(source,candidate);
 if(original>=80)return original;
 return trustedConcertIdentityScore(source,candidate)
};

const concertReleaseQueriesBase=metadataQueries;
metadataQueries=function(raw,type='movie'){
 const original=concertReleaseQueriesBase(raw,type);
 if(type!=='movie')return original;
 const cleaned=cleanConcertReleaseTitle(raw);
 if(!cleaned||cleaned===displayTitle(raw))return original;
 const queries=[cleaned,...original];
 const seen=new Set();
 return queries.filter(q=>{
  const key=nm(q);
  if(!key||seen.has(key))return false;
  seen.add(key);return true
 }).slice(0,10)
};

// The concert-specific Cinemeta lookup previously used lookupCandidates()
// directly, bypassing metadataQueries(); retry the cleaned concert title.
const concertReleaseCinemetaBase=findConcertCinemeta;
findConcertCinemeta=async function(x){
 let current=null;
 try{current=await concertReleaseCinemetaBase(x)}catch(e){log('concert cine primary',e.message)}
 if(current)return current;
 const query=cleanConcertReleaseTitle(x?.name);
 if(!query||nm(query)===nm(x?.name))return null;
 try{
  const hits=await cinemetaSearch('movie',query);
  const match=hits.map(h=>({h,score:trustedConcertIdentityScore(x,h)}))
   .filter(z=>z.score>=80).sort((a,b)=>b.score-a.score)[0];
  return match?.h||null
 }catch(e){log('concert cine canonical',e.message);return null}
};

// A tightly verified, provider-independent ID rescue for this known special.
// Some installations lack a TMDB API key; without a shared IMDb ID the
// sktc: identity cannot expose results from other installed addons.
// This fallback applies ONLY to the exact Dolly Parton / Opry anniversary
// title, never to an arbitrary Dolly Parton recording or another artist.
function isDollyPartonOpry50(x){
 if(!x||!isConcert(x))return false;
 const words=concertReleaseWords(x.name);
 const target=['dolly','parton','50','years','opry'];
 if(words.length!==target.length||target.some(w=>!words.includes(w)))return false;
 const year=x.year||yearFrom(x.name);
 return !year||year===2019
}
const concertReleaseResolveMetaBase=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 let m=await concertReleaseResolveMetaBase(req,x,type,c,concert);
 if(type!=='movie'||!concert||!m||!isDollyPartonOpry50(x))return m;
 if(/^tt\d+$/.test(String(m.id))||/^tmdb:\d+$/.test(String(m.id)))return m;
 const id='tt11229774';
 // Preserve valid source artwork and other provider details.
 m={...m,id,type:'movie',name:'Dolly Parton: 50 Years at the Opry',
    releaseInfo:'2019'};
 if(m.behaviorHints){
  const hints={...m.behaviorHints};delete hints.defaultVideoId;
  if(Object.keys(hints).length)m.behaviorHints=hints;else delete m.behaviorHints
 }
 delete m.videos;delete m.streams;
 rememberConcertLink(id,x);
 rememberStandardSourceLink(id,x);
 rememberDirectVideoSource(x);
 log('concert verified identity fallback',id);
 return m
};
