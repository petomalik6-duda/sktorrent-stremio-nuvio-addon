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
   headers:{Accept:'application/sparql-results+json','User-Agent':'SKTorrent-Wako-ID-Resolver/2.2.3'}
  });
  const bindings=r?.data?.results?.bindings||[];
  for(const b of bindings){const id=validImdbId(b?.imdb?.value);if(id)return id;}
 }catch{}
 return null;
}
async function resolveTmdbToImdb(value,{tmdbKey,http=axios}={}){
 const tmdbId=validTmdbId(value);if(!tmdbId)return null;
 const key=String(tmdbId),now=Date.now(),hit=cache.get(key);
 if(hit&&hit.e>now)return hit.v;
 const imdb=await fromTmdb(tmdbId,tmdbKey,http)||await fromWikidata(tmdbId,http)||null;
 cache.set(key,{v:imdb,e:now+(imdb?HIT_TTL:MISS_TTL)});
 return imdb;
}
function clearCache(){cache.clear();}

module.exports={resolveTmdbToImdb,fromTmdb,fromWikidata,validImdbId,validTmdbId,clearCache};
