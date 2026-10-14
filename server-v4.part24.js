
// v2.0.0 follow-up: fast parallel Cinemeta fallback.
// The legacy matcher could try many title variants serially; on a cold cache this
// multiplied provider latency across dozens of catalog items.
const PERF_V2_CINEMETA_MOVIE_QUERIES=Math.max(1,Math.min(4,Number(process.env.CINEMETA_MOVIE_QUERY_LIMIT||2)||2));
const PERF_V2_CINEMETA_SERIES_QUERIES=Math.max(1,Math.min(5,Number(process.env.CINEMETA_SERIES_QUERY_LIMIT||3)||3));
findCinemeta=async function(x,type){
 const negKey=`neg:cine-fast:${type}:${nm(x?.name)}:${x?.year||''}`;
 if(perfV2NegativeGet(negKey))return null;
 const limit=type==='series'?PERF_V2_CINEMETA_SERIES_QUERIES:PERF_V2_CINEMETA_MOVIE_QUERIES;
 const queries=metadataQueries(x?.name||'',type).slice(0,limit);
 if(!queries.length){perfV2NegativeSet(negKey);return null}
 const groups=await Promise.all(queries.map(async q=>{
  try{return{q,rows:await cinemetaSearch(type,q)}}catch(e){log('cinemeta fast',q,e.message);return{q,rows:[]}}
 }));
 for(const {q,rows} of groups){const hit=pickMetadataHit(rows,q,x?.year,type);if(hit)return hit}
 perfV2NegativeSet(negKey);return null
};
