
// v1.8: demand-driven catalog pagination across the SKTorrent history
const FULL_CATALOG_MAX_PAGES=Math.max(50,Number(process.env.FULL_CATALOG_MAX_PAGES||1000)||1000);
function catalogSourceCategories(id){
 switch(id){
  case'skt-novinky-dabing-filmy':return[CAT.DABING];
  case'skt-novinky-dabing-serialy':case'skt-serialy-czsk':case'skt-posledne-serialy':return[CAT.SERIES];
  case'skt-4k-uhd-czsk':return[CAT.UHD,CAT.DABING];
  case'skt-nove-koncerty':case'skt-posledne-koncerty':case'skt-4k-uhd-koncerty':return[CAT.CONCERTS];
  default:return[0]
 }
}
function itemTime(x){return x?.addedDate?.getTime?.()||0}
async function fullCatalogWindow(id,c={},skip=0,count=80){
 const cats=catalogSourceCategories(id),states=cats.map(category=>({category,page:0,done:false,tail:Infinity})),seen=new Map(),need=Math.max(1,skip+count);let fetchedPages=0;
 while(states.some(s=>!s.done)&&fetchedPages<FULL_CATALOG_MAX_PAGES){
  const active=states.filter(s=>!s.done),batches=await Promise.all(active.map(async s=>{try{return{state:s,rows:await fetchPage(s.page,c,s.category)}}catch(e){log('full catalog page',id,s.category,s.page,e.message);return{state:s,rows:[],error:e}}}));
  for(const{state:s,rows,error}of batches){
   fetchedPages++;s.page++;
   if(error||rows.length<10)s.done=true;
   if(rows.length){const times=rows.map(itemTime).filter(Boolean);if(times.length)s.tail=Math.min(...times)}
   for(const x of rows){if(seen.has(x.id))continue;if(filter(id,[x]).length)seen.set(x.id,x)}
  }
  if(seen.size>=need){
   const ordered=[...seen.values()].sort((a,b)=>itemTime(b)-itemTime(a)),threshold=itemTime(ordered[Math.min(need-1,ordered.length-1)]);
   if(states.every(s=>s.done||s.tail<=threshold))break
  }
 }
 const ordered=[...seen.values()].sort((a,b)=>itemTime(b)-itemTime(a));
 return{items:ordered.slice(skip,skip+count),matched:ordered.length,fetchedPages,exhausted:states.every(s=>s.done),sourcePages:states.map(s=>({category:s.category,pages:s.page,done:s.done}))}
}
async function catalog(req,res,c){
 c=authConfig(c);const spec=ALL_CATS.find(x=>x.type===req.params.type&&x.id===req.params.id);if(!spec)return res.status(404).json({metas:[]});const ex=extraOf(req.params.extra),sk=ex.skip;
 if(spec.search){
  if(!ex.search)return res.json({metas:[]});
  let raw=spec.concert?await searchConcertItems(ex.search,c,Math.min(20,pages(c))):await searchItems(ex.search,c,Math.min(20,pages(c)));
  if(spec.concert)raw=raw.filter(isConcert);else raw=raw.filter(spec.type==='series'?isSeries:isMovie);
  raw=raw.sort((a,b)=>searchRank(b,ex.search)-searchRank(a,ex.search));
  const batch=raw.slice(sk,sk+80);let metas=await mapLimit(batch,7,x=>resolveMeta(req,x,spec.type,c,Boolean(spec.concert)));metas=dedupMetas(metas);if(spec.type==='series')metas=metas.filter(m=>/^tt\d+$/.test(m.id)||m.id.startsWith('tmdb:'));metas=metas.slice(0,PAGE_SIZE);
  log(`search ${spec.concert?'concert':spec.type} q=${ex.search} skip=${sk} raw=${raw.length} metas=${metas.length}`);return res.json({metas})
 }
 const win=await fullCatalogWindow(spec.id,c,sk,Math.max(PAGE_SIZE*2,80)),concert=spec.id.includes('koncert');let metas=await mapLimit(win.items,7,x=>resolveMeta(req,x,spec.type,c,concert));metas=dedupMetas(metas).slice(0,PAGE_SIZE);
 log(`catalog-full ${spec.id} skip=${sk} matched=${win.matched} fetchedPages=${win.fetchedPages} exhausted=${win.exhausted} metas=${metas.length} sources=${JSON.stringify(win.sourcePages)}`);return res.json({metas})
}
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.0',name:'SKTorrent Katalógy',description:'SKTorrent katalógy s plným stránkovaním histórie, automatickým prihlásením, hybridnými IMDb/TMDB koncertmi a vlastným prehrávaním.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.0',catalogs:ALL_CATS.length,fullCatalogPagination:true,pageSize:PAGE_SIZE,maxSafetyPages:FULL_CATALOG_MAX_PAGES,search:true,concertSearch:true,hybridConcertIds:true,sktPlayback:true,standardIds:true,usernamePasswordLogin:true,encryptedLoginToken:true,configSecretConfigured:Boolean(process.env.CONFIG_SECRET),categories:CAT,at:new Date().toISOString()}));
app.get('/debug/full-page/:id/:skip',async(q,r)=>{try{const skip=Math.max(0,Number(q.params.skip)||0),win=await fullCatalogWindow(q.params.id,{},skip,PAGE_SIZE);r.json({ok:true,id:q.params.id,skip,count:win.items.length,matched:win.matched,fetchedPages:win.fetchedPages,exhausted:win.exhausted,sourcePages:win.sourcePages,sample:win.items.slice(0,3).map(x=>({id:x.id,name:x.name,added:x.added}))})}catch(e){r.status(502).json({ok:false,error:e.message})}});
