
// Concert identity fallback for Jellyfin/AIOStreams Web and Stremio clients.
// Keep shared tt/tmdb IDs intact; only strengthen source discovery when the
// original exact-title matching cannot find a concert. No forced sktv IDs.

// Titles in SKTorrent often append codec, language and release tags that have
// no significance for the concert itself. Keep artist and venue/title words.
const CONCERT_SOURCE_NOISE=new Set([
 'the','and','for','with','from','into','at','in','of','on','a','an',
 'full','complete','official','video','music','hd','sd','uhd','dvd',
 'bluray','bdrip','brrip','bdremux','remux','webrip','webdl','hdr',
 'dovi','dv','dts','atmos','ac3','aac','mp3','flac','wav','truehd',
 'hevc','avc','h264','h265','x264','x265','xvid','multiaudio',
 'proper','repack','multi','cz','sk','en','eng','czech','slovak',
 'german','english','concert','koncert','live','tour','show','performance',
 'recording','festival','edition','anniversary','part','disc','disk'
]);
function concertIdentityWords(raw){
 const cleanTitle=String(lookupTitle(raw||'')||raw||'');
 const cleaned=nm(cleanTitle);
 return [...new Set(cleaned.split(' ').filter(w=>
  w.length>1&&!CONCERT_SOURCE_NOISE.has(w)&&
  !/^(19|20)\d\d$/.test(w)&&
  !/^(?:\d{3,4}p|\d{1,2}bit)$/.test(w)
 ))]
}
function strongConcertSourceScore(x,target){
 if(!x||!target||!isConcert(x))return-999;
 const sourceWords=concertIdentityWords(x.name),
       names=[target.name,target.originalName,target.title,target.original_title]
         .filter(v=>typeof v==='string'&&v.trim()),
       sourceSet=new Set(sourceWords);
 let best=-999;
 for(const title of names){
  const wanted=concertIdentityWords(title);
  if(!wanted.length)continue;
  const matched=wanted.filter(w=>sourceSet.has(w)).length;
  const minRequired=Math.max(2,Math.ceil(wanted.length*0.8));
  // Single-word matches are never enough: "Live in London" must not match
  // a random London concert or the wrong artist.
  if(matched<minRequired)continue;
  const coverage=matched/wanted.length;
  const sourceCoverage=matched/Math.max(sourceWords.length,1);
  const sameCore=wanted.length===sourceWords.length&&coverage===1;
  if(!sameCore&&sourceCoverage<0.4)continue;
  const yearA=targetYear(target),yearB=x.year||yearFrom(x.name);
  // Filming year and release year often differ, but wildly different years
  // with non-exact titles are not a safe identity match.
  if(yearA&&yearB&&Math.abs(yearA-yearB)>6&&!sameCore)continue;
  const score=100+matched*18+Math.round(coverage*50)+
     Math.round(sourceCoverage*20)+(sameCore?35:0)+
     (yearA&&yearB&&Math.abs(yearA-yearB)<=3?15:0);
  best=Math.max(best,score);
 }
 return best
}

// Recognize concert video titles in a general music category even when the
// release string does not contain a codec/quality tag. Audio-only formats are
// never accepted as video; chooseVideoFile still validates .mkv/.mp4/etc.
const concertIdentityIsConcertBase=isConcert;
isConcert=function(x){
 if(concertIdentityIsConcertBase(x))return true;
 const category=nodiac(x?.category||'').toLowerCase();
 if(!/\b(hudba|music|hudebni)\b/.test(category))return false;
 const name=nodiac(x?.name||'').toLowerCase();
 if(/\b(flac|mp3|wavpack|wav|aac|hi-?res)\b/.test(name))return false;
 return /\b(koncert|concert|live\s+(?:in|at|from)|live\s+tour|unplugged)\b/.test(name)
};

// The meta route already prefers TMDB when IMDb/Cinemeta is unavailable.
// Standard stream lookup must use the same fallback, otherwise Jellyfin can
// display a poster/description but no versions.
const concertIdentityTargetBase=targetFromStandard;
targetFromStandard=async function(type,id,c){
 let meta=null;
 try{meta=await concertIdentityTargetBase(type,id,c)}catch(e){
  log('standard target primary',id,e.message)
 }
 if(meta)return meta;
 const base=standardStreamBase(id);
 if(/^tt\d+$/.test(base)){
  try{return await tmdbMetaByImdb(type,base,authConfig(c))}catch(e){
   log('standard target TMDB fallback',base,e.message)
  }
 }
 return null
};

function concertIdentityQueries(target){
 const queries=[],seen=new Set();
 function add(raw){
  const query=clean(raw);
  const key=nm(query);
  if(query.length<3||seen.has(key))return;
  seen.add(key);queries.push(query)
 }
 for(const raw of [target?.name,target?.originalName,target?.title,target?.original_title]){
  if(typeof raw!=='string'||!raw.trim())continue;
  const cleanName=lookupTitle(raw);
  const words=concertIdentityWords(raw);
  // Full names are already searched by the base implementation; try
  // distinctive artist/title prefixes and variants with punctuation removed.
  if(words.length>=2)add(words.slice(0,2).join(' '));
  if(words.length>=3)add(words.slice(0,3).join(' '));
  if(words.length>=4)add(words.slice(0,4).join(' '));
  const before=cleanName.split(/\s+[-–—:]\s+/)[0];
  if(before!==cleanName&&before.split(/\s+/).length>=2)add(before);
 }
 return queries.slice(0,5)
}

const concertIdentityCandidatesBase=concertCandidatesForStandard;
concertCandidatesForStandard=async function(target,base,c){
 let existing=[];
 try{existing=await concertIdentityCandidatesBase(target,base,c)}catch(e){
  log('concert primary candidates',base,e.message)
 }
 // Preserve successful exact matches and cache links; additional searches
 // are only needed for titles that the older matcher could not resolve.
 if(existing.some(item=>item?.x&&['concert','linked'].includes(item.kind)))return existing;
 const queries=concertIdentityQueries(target);
 if(!queries.length)return existing;
 const batches=await Promise.all(queries.map(q=>
  searchConcertItems(q,c,2).catch(e=>{log('concert alternate query',q,e.message);return[]})
 ));
 let sources=[...new Map(batches.flat().filter(x=>x?.id).map(x=>[x.id,x])).values()];
 if(!sources.some(x=>strongConcertSourceScore(x,target)>0)){
  // Some music videos are outside the dedicated concert category. Only
  // search the general index if the dedicated category could not match.
  const fallback=await Promise.all(queries.slice(0,2).map(q=>
   searchItems(q,c,2).catch(()=>[])
  ));
  sources=[...new Map([...sources,...fallback.flat()].filter(x=>x?.id).map(x=>[x.id,x])).values()];
 }
 const matches=sources.map(x=>({x,s:strongConcertSourceScore(x,target)+500,kind:'concert-alias'}))
  .filter(x=>x.s>=500).sort((a,b)=>b.s-a.s);
 const map=new Map(existing.filter(x=>x?.x?.id).map(x=>[x.x.id,x]));
 for(const item of matches)if(!map.has(item.x.id))map.set(item.x.id,item);
 const result=[...map.values()].sort((a,b)=>b.s-a.s);
 if(matches.length)log('concert alternate candidates',base,'matches',matches.length);
 return result
};
