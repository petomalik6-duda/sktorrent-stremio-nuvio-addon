
// Generic concert metadata identity resolver for SKTorrent's Stremio/Jellyfin
// catalog. Extends the Dolly/Opry release-name cleaning without introducing
// hardcoded IMDb/TMDB mappings for additional artists.
//
// Safety: only provider-returned standard IDs are accepted. Artist + distinctive
// title/venue words and compatible release year must match; ambiguous hits
// remain local sktc: IDs. Does not alter streams, Wako or TorBox handling.

const CONCERT_IDENTITY_MIN_MARGIN=15;
const CONCERT_IDENTITY_CACHE_TTL=12*60*60*1000;

function concertGenericQueries(x){
 const name=String(x?.name||'');
 const canonical=cleanConcertReleaseTitle(name);
 if(!canonical)return[];
 const withoutYear=canonical.replace(/\s*\(?\b(?:19|20)\d{2}\b\)?\s*$/,'').trim();
 const groups=[canonical,withoutYear];
 // A provider may index "Artist: Live at Venue" without the extra edition or
 // quality labels used on SKTorrent.
 const titleWords=concertReleaseWords(name);
 if(titleWords.length>=3){
  groups.push(titleWords.slice(0,Math.min(titleWords.length,5)).join(' '));
 }
 if(titleWords.length>=2)groups.push(titleWords.slice(0,2).join(' '));
 const out=[],seen=new Set();
 for(const q of groups){
  const val=clean(q),key=nm(val);
  if(key.length<4||seen.has(key))continue;
  seen.add(key);out.push(val);
 }
 return out.slice(0,4)
}
function concertGenericMatchScore(source,hit){
 if(!source?.name||!isConcert(source)||!hit)return-999;
 const sourceWords=concertReleaseWords(source.name);
 if(sourceWords.length<2)return-999;
 const possibleNames=[hit.name,hit.title,hit.original_title,hit.original_name]
  .filter(v=>typeof v==='string'&&v.trim());
 const sourceSet=new Set(sourceWords);
 const sourceYear=source.year||yearFrom(source.name);
 const hitYearValue=hitYear(hit)||movieProviderYear(hit);
 // Distinctive year conflicts are not safe: a recording from 2006 must not
 // become a different concert from 2024 because the artist/venue are shared.
 if(sourceYear&&hitYearValue&&Math.abs(sourceYear-hitYearValue)>2)return-999;
 let best=-999;
 for(const label of possibleNames){
  const candidateWords=concertReleaseWords(label);
  if(candidateWords.length<2)continue;
  const matched=candidateWords.filter(w=>sourceSet.has(w)).length;
  const sourceCoverage=matched/sourceWords.length;
  const candidateCoverage=matched/candidateWords.length;
  // A single common artist/word cannot establish identity.
  if(matched<2||sourceCoverage<0.8||candidateCoverage<0.75)continue;
  const sameLength=sourceWords.length===candidateWords.length;
  const yearBonus=sourceYear&&hitYearValue?15:0;
  const score=100+Math.round(sourceCoverage*60)+
   Math.round(candidateCoverage*40)+matched*8+
   (sameLength&&sourceCoverage===1?25:0)+yearBonus;
  best=Math.max(best,score);
 }
 return best
}
function selectUniqueConcertProviderHit(source,rows,provider){
 const allowed=rows.filter(h=>h&&
  (provider==='cinemeta'?/^tt\d+$/.test(String(h.id||'')):
   Number.isInteger(Number(h.id))&&Number(h.id)>0)
 );
 const scored=allowed.map(h=>({hit:h,score:concertGenericMatchScore(source,h)}))
  .filter(z=>z.score>=200).sort((a,b)=>b.score-a.score);
 if(!scored.length)return null;
 const top=scored[0];
 const competing=scored.find(z=>String(z.hit.id)!==String(top.hit.id));
 if(competing&&top.score-competing.score<CONCERT_IDENTITY_MIN_MARGIN){
  log('concert ambiguous provider candidates',provider,cleanConcertReleaseTitle(source.name));
  return null
 }
 return top.hit
}
function concertGenericCacheKey(source,provider){
 return 'concert-generic-id-v1:'+provider+':'+nm(source.name)+':'+(source.year||'');
}

const concertGenericCinemetaBase=findConcertCinemeta;
findConcertCinemeta=async function(x){
 if(!x||!isConcert(x))return concertGenericCinemetaBase(x);
 const key=concertGenericCacheKey(x,'cinemeta');
 const known=successfulCacheGet(key);
 if(known)return known;
 let base=null;
 try{base=await concertGenericCinemetaBase(x)}catch(e){
  log('concert generic Cinemeta primary',e.message)
 }
 if(base&&concertGenericMatchScore(x,base)>=200){
  return successfulCacheSet(key,base,CONCERT_IDENTITY_CACHE_TTL)
 }
 const queries=concertGenericQueries(x);
 const sets=await Promise.all(queries.map(q=>
  cinemetaSearch('movie',q).catch(e=>{
   log('concert generic Cinemeta query',q,e.message);return[]
  })
 ));
 const all=[...(base?[base]:[]),...sets.flat()];
 const hit=selectUniqueConcertProviderHit(x,all,'cinemeta');
 if(hit)return successfulCacheSet(key,hit,CONCERT_IDENTITY_CACHE_TTL);
 return null
};

const concertGenericTmdbBase=tmdbSearch;
tmdbSearch=async function(x,type,c,concert=false){
 if(type!=='movie'||!concert||!x||!isConcert(x)){
  return concertGenericTmdbBase(x,type,c,concert)
 }
 const keyApi=c?.tmdbKey||process.env.TMDB_API_KEY;
 if(!keyApi)return null;
 const key=concertGenericCacheKey(x,'tmdb')+':'+perfV2KeyFingerprint(keyApi);
 const known=successfulCacheGet(key);
 if(known)return known;
 let base=null;
 try{base=await concertGenericTmdbBase(x,type,c,true)}catch(e){
  log('concert generic TMDB primary',e.message)
 }
 if(base&&concertGenericMatchScore(x,base)>=200){
  return successfulCacheSet(key,base,CONCERT_IDENTITY_CACHE_TTL)
 }
 const queries=concertGenericQueries(x).slice(0,3);
 // Search without a year constraint first: concert filming and release dates
 // can differ, but the score still rejects mismatched known years.
 const groups=await Promise.all(queries.map(q=>
  metadataGet('https://api.themoviedb.org/3/search/movie',
   {params:{api_key:keyApi,query:q,language:'en-US',include_adult:false}},
   'concert generic TMDB '+q).then(r=>r.data?.results||[])
    .catch(e=>{log('concert generic TMDB query',q,e.message);return[]})
 ));
 const matches=[...(base?[base]:[]),...groups.flat()];
 const hit=selectUniqueConcertProviderHit(x,matches,'tmdb');
 if(!hit)return null;
 let imdb=hit.imdb||null;
 if(!/^tt\d+$/.test(String(imdb||''))){
  try{
   const ids=await metadataGet(
    'https://api.themoviedb.org/3/movie/'+hit.id+'/external_ids',
    {params:{api_key:keyApi}},'concert generic TMDB external '+hit.id);
   imdb=/^tt\d+$/.test(String(ids.data?.imdb_id||''))?ids.data.imdb_id:null
  }catch(e){log('concert generic TMDB external',hit.id,e.message)}
 }
 return successfulCacheSet(key,{...hit,imdb},CONCERT_IDENTITY_CACHE_TTL)
};
