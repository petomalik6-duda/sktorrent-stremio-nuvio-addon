'use strict';

const axios=require('axios');
const cache=new Map();
const HIT_TTL=7*24*60*60*1000;
const MISS_TTL=60*60*1000;

function validTmdbId(value){
 const id=Number(value);
 return Number.isSafeInteger(id)&&id>0?id:null;
}
function validImdbId(value){
 const id=String(value||'').trim().toLowerCase();
 return /^tt\d{5,12}$/.test(id)?id:null;
}
async function fromTmdb(tmdbId,tmdbKey,http=axios){
 if(!tmdbKey)return null;
 try{
  const r=await http.get(`https://api.themoviedb.org/3/movie/${tmdbId}/external_ids`,{timeout:4500,params:{api_key:tmdbKey}});
  return validImdbId(r?.data?.imdb_id);
 }catch{return null;}
}
async function fromWikidata(tmdbId,http=axios){
 const query=`SELECT ?imdb WHERE { ?item wdt:P4947 "${tmdbId}". ?item wdt:P345 ?imdb. } LIMIT 2`;
 try{
  const r=await http.get('https://query.wikidata.org/sparql',{
   timeout:5000,
   params:{query,format:'json'},
   headers:{Accept:'application/sparql-results+json','User-Agent':'SKTorrent-Wako-ID-Resolver/2.2.5'}
  });
  const bindings=r?.data?.results?.bindings||[];
  for(const b of bindings){const id=validImdbId(b?.imdb?.value);if(id)return id;}
 }catch{}
 return null;
}
async function fromWikidataBatch(tmdbIds,http=axios){
 const ids=[...new Set((tmdbIds||[]).map(validTmdbId).filter(Boolean))];
 const out=new Map();if(!ids.length)return out;
 const values=ids.map(id=>`"${id}"`).join(' ');
 const query=`SELECT ?tmdb ?imdb WHERE { VALUES ?tmdb { ${values} } ?item wdt:P4947 ?tmdb. ?item wdt:P345 ?imdb. }`;
 try{
  const r=await http.get('https://query.wikidata.org/sparql',{
   timeout:5000,
   params:{query,format:'json'},
   headers:{Accept:'application/sparql-results+json','User-Agent':'SKTorrent-Wako-ID-Resolver/2.2.5'}
  });
  for(const b of r?.data?.results?.bindings||[]){
   const tmdb=validTmdbId(b?.tmdb?.value),imdb=validImdbId(b?.imdb?.value);
   if(tmdb&&imdb&&!out.has(tmdb))out.set(tmdb,imdb);
  }
 }catch{}
 return out;
}
async function resolveTmdbToImdb(value,{tmdbKey,http=axios}={}){
 const tmdbId=validTmdbId(value);if(!tmdbId)return null;
 const key=String(tmdbId),now=Date.now(),hit=cache.get(key);
 if(hit&&hit.e>now)return hit.v;
 const imdb=await fromTmdb(tmdbId,tmdbKey,http)||await fromWikidata(tmdbId,http)||null;
 cache.set(key,{v:imdb,e:now+(imdb?HIT_TTL:MISS_TTL)});
 return imdb;
}
async function resolveTmdbBatchToImdb(values,{tmdbKey,http=axios}={}){
 const ids=[...new Set((values||[]).map(validTmdbId).filter(Boolean))],result=new Map(),now=Date.now(),missing=[];
 for(const id of ids){const hit=cache.get(String(id));if(hit&&hit.e>now)result.set(id,hit.v);else missing.push(id)}
 if(!missing.length)return result;
 const tmdbPromise=tmdbKey?Promise.all(missing.map(async id=>[id,await fromTmdb(id,tmdbKey,http)])):Promise.resolve([]);
 const wikidataPromise=fromWikidataBatch(missing,http);
 const [tmdbRows,wikidata]=await Promise.all([tmdbPromise,wikidataPromise]);
 const tmdbMap=new Map(tmdbRows);
 for(const id of missing){
  const imdb=tmdbMap.get(id)||wikidata.get(id)||null;
  cache.set(String(id),{v:imdb,e:now+(imdb?HIT_TTL:MISS_TTL)});
  result.set(id,imdb);
 }
 return result;
}
function clearCache(){cache.clear();}

module.exports={resolveTmdbToImdb,resolveTmdbBatchToImdb,fromTmdb,fromWikidata,fromWikidataBatch,validImdbId,validTmdbId,clearCache};
