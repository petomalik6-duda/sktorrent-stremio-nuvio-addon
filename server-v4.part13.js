
// v1.8.6: preserve exact SKTorrent source behind standard IMDb/TMDB metadata IDs
const STANDARD_SOURCE_LINK_TTL=24*60*60*1000;
function standardStreamBase(id){
 const bits=String(id||'').split(':');
 if(/^tt\d+$/.test(bits[0]))return bits[0];
 if(String(id||'').startsWith('tmdb:'))return bits.slice(0,2).join(':');
 return String(id||'')
}
function rememberStandardSourceLink(id,x){
 const base=standardStreamBase(id);if(!x||!(/^tt\d+$/.test(base)||base.startsWith('tmdb:')))return;
 cache.set(`standard-source:${base}`,{v:x,e:Date.now()+STANDARD_SOURCE_LINK_TTL})
}
function getStandardSourceLink(id){const base=standardStreamBase(id),h=cache.get(`standard-source:${base}`);return h&&h.e>Date.now()?h.v:null}
const _resolveMetaBeforeStandardSourceLink=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 const m=await _resolveMetaBeforeStandardSourceLink(req,x,type,c,concert);
 if(m&&(/^tt\d+$/.test(m.id)||String(m.id||'').startsWith('tmdb:')))rememberStandardSourceLink(m.id,x);
 return m
};
function fallbackSourceQueries(target,type){
 const out=[];
 function add(v){v=clean(v);if(v&&!out.some(x=>nm(x)===nm(v)))out.push(v)}
 for(const raw of [target?.name,target?.originalName,target?.title,target?.original_title].filter(Boolean)){
  const q=type==='series'?canonicalSeriesTitle(raw):canonicalMovieMetadataTitle(raw);add(q);
  const words=nm(q).split(' ').filter(w=>w.length>2&&!['the','and','for','with','from'].includes(w));
  if(words.length>=3)add(words.slice(0,2).join(' '));
  if(words.length>=1)add(words[0])
 }
 return out.slice(0,6)
}
function safeSourceCandidate(x,target,type,season=null,ep=null){
 const s=scoreCandidate(x,target,type,season,ep);if(s<55)return-999;
 if(type!=='movie')return s;
 const ty=targetYear(target),xy=x.year||yearFrom(x.name);if(ty&&xy&&Math.abs(ty-xy)>1)return-999;
 const tq=canonicalMovieMetadataTitle(target?.name||target?.originalName||''),sq=canonicalMovieMetadataTitle(x.name||''),tw=wordSet(tq),sw=wordSet(sq),shared=[...tw].filter(w=>sw.has(w)).length,coverage=tw.size?shared/tw.size:0;
 if(tw.size>=3&&(shared<2||coverage<0.66))return-999;
 if(tw.size===2&&coverage<0.5)return-999;
 if(tw.size===1&&shared<1)return-999;
 return s+Math.round(coverage*40)
}
async function streamFromSktSource(x,type,base,season,ep,c){
 const td=await torrentData(x,c),f=chooseVideoFile(td,type,season,ep);return f?makeStream(x,td,f,base):null
}
streamsForStandard=async function(type,id,c){
 c=authConfig(c);const bits=String(id||'').split(':'),base=standardStreamBase(id),season=/^tt\d+$/.test(bits[0])&&bits.length>=3?+bits[1]:null,ep=/^tt\d+$/.test(bits[0])&&bits.length>=3?+bits[2]:null,target=await targetFromStandard(type,base,c),linked=getStandardSourceLink(base),ranked=[];
 if(linked)ranked.push({x:linked,s:10000,kind:'linked'});
 if(target){
  const all=[];for(const q of fallbackSourceQueries(target,type)){try{all.push(...await searchItems(q,c,4))}catch(e){log('source search',q,e.message)}}
  for(const x of [...new Map(all.map(v=>[v.id,v])).values()]){const s=safeSourceCandidate(x,target,type,season,ep);if(s>=55)ranked.push({x,s,kind:'search'})}
  if(type==='movie')ranked.push(...await concertCandidatesForStandard(target,base,c))
 }
 const unique=[...new Map(ranked.sort((a,b)=>b.s-a.s).map(z=>[z.x.id,z])).values()].slice(0,10),streams=[];
 for(const z of unique.slice(0,6)){try{const st=await streamFromSktSource(z.x,type,base,season,ep,c);if(st)streams.push(st)}catch(e){log(`torrent ${z.kind}`,z.x.name,e.message)}}
 const dedup=[...new Map(streams.map(s=>[`${s.infoHash||''}:${s.fileIdx??''}`,s])).values()];
 log(`standard-source ${base} target=${target?.name||'-'} linked=${Boolean(linked)} candidates=${unique.length} streams=${dedup.length}`);
 return dedup
};
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.6',name:'SKTorrent Katalógy',description:'SKTorrent katalógy s priamym prepojením IMDb/TMDB detailov na pôvodný SKTorrent zdroj, prísnym párovaním, jazykovými vlajkami, titulkami a prehrávaním.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.6',catalogs:ALL_CATS.length,standardSourceLink:true,broadSourceFallback:true,strictMovieMetadataMatching:true,streamLanguageFlags:true,streamSubtitleInfo:true,seriesEpisodeGrouping:true,localSeriesFallback:true,fullCatalogPagination:true,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
app.get('/debug/source-search/:title',async(q,r)=>{try{const title=clean(q.params.title),target={name:title,releaseInfo:String(q.query.year||'')},queries=fallbackSourceQueries(target,'movie'),all=[];for(const query of queries)try{all.push(...await searchItems(query,{},2))}catch{}const rows=[...new Map(all.map(x=>[x.id,x])).values()].map(x=>({name:x.name,year:x.year,score:safeSourceCandidate(x,target,'movie'),id:x.id})).sort((a,b)=>b.score-a.score);r.json({ok:true,title,queries,results:rows.slice(0,20)})}catch(e){r.status(502).json({ok:false,error:e.message})}});
