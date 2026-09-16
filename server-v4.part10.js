
// v1.8.3: grouped local-series fallback so episodic shows never disappear when metadata providers fail
const SERIES_GROUP_TTL=24*60*60*1000;
function seriesGroupId(title){return `sktseriesg:${crypto.createHash('sha1').update(nm(title)).digest('hex').slice(0,20)}`}
function seriesGroupCacheSet(id,g){cache.set(`series-group:${id}`,{v:g,e:Date.now()+SERIES_GROUP_TTL});return g}
function seriesGroupCacheGet(id){const h=cache.get(`series-group:${id}`);return h&&h.e>Date.now()?h.v:null}
function groupSeriesItems(items){
 const groups=new Map();
 for(const x of items||[]){
  const title=canonicalSeriesTitle(x.name);if(!title)continue;
  const key=nm(title);if(!groups.has(key))groups.set(key,{title,items:[]});groups.get(key).items.push(x)
 }
 return [...groups.values()].map(g=>{g.items.sort((a,b)=>(b.addedDate?.getTime()||0)-(a.addedDate?.getTime()||0));g.id=seriesGroupId(g.title);return g})
}
function localSeriesGroupMeta(req,g){
 const rep=g.items[0]||{},videos=[],seen=new Set();let seq=1;
 for(const x of g.items){
  const e=episode(x.name),season=e.season||1,ep=e.episode||null;if(!ep)continue;
  const k=`${season}:${ep}`;if(seen.has(k))continue;seen.add(k);
  videos.push({id:`${g.id}:${season}:${ep}:${x.id}`,title:`${g.title} S${String(season).padStart(2,'0')}E${String(ep).padStart(2,'0')}`,season,episode:ep,released:x.addedDate?x.addedDate.toISOString():undefined,overview:`SKTorrent • ${x.size||''} • ${x.seeds||0} seed`})
 }
 videos.sort((a,b)=>a.season-b.season||a.episode-b.episode);
 if(!videos.length){for(const x of g.items.slice(0,50)){videos.push({id:`${g.id}:1:${seq}:${x.id}`,title:`${g.title} • ${seq}`,season:1,episode:seq++})}}
 return{id:g.id,type:'series',name:g.title,poster:rep.poster||fallbackPoster(req,g.title),posterShape:'poster',description:[rep.category,rep.added&&`Pridané ${rep.added}`,`${g.items.length} SKTorrent položiek`].filter(Boolean).join(' • '),releaseInfo:rep.year?String(rep.year):undefined,videos}
}
async function resolveSeriesGroup(req,g,c){
 const rep={...g.items[0],name:g.title};
 const m=await resolveMeta(req,rep,'series',c,false);
 if(m&&(/^tt\d+$/.test(m.id)||m.id.startsWith('tmdb:')))return m;
 seriesGroupCacheSet(g.id,g);return localSeriesGroupMeta(req,g)
}
async function catalog(req,res,c){
 c=authConfig(c);const spec=ALL_CATS.find(x=>x.type===req.params.type&&x.id===req.params.id);if(!spec)return res.status(404).json({metas:[]});const ex=extraOf(req.params.extra),sk=ex.skip;
 if(spec.search){
  if(!ex.search)return res.json({metas:[]});
  let raw=spec.concert?await searchConcertItems(ex.search,c,Math.min(20,pages(c))):await searchItems(ex.search,c,Math.min(20,pages(c)));
  if(spec.concert)raw=raw.filter(isConcert);else raw=raw.filter(spec.type==='series'?isSeries:isMovie);
  raw=raw.sort((a,b)=>searchRank(b,ex.search)-searchRank(a,ex.search));
  if(spec.type==='series'){
   const groups=groupSeriesItems(raw),batch=groups.slice(sk,sk+PAGE_SIZE);const metas=await mapLimit(batch,4,g=>resolveSeriesGroup(req,g,c));
   log(`series-search-group q=${ex.search} raw=${raw.length} groups=${groups.length} metas=${metas.length}`);return res.json({metas:dedupMetas(metas).slice(0,PAGE_SIZE)})
  }
  const batch=raw.slice(sk,sk+100);let metas=await mapLimit(batch,6,x=>resolveMeta(req,x,spec.type,c,Boolean(spec.concert)));return res.json({metas:dedupMetas(metas).slice(0,PAGE_SIZE)})
 }
 const win=await fullCatalogWindow(spec.id,c,sk,Math.max(PAGE_SIZE*4,160)),concert=spec.id.includes('koncert');
 if(spec.type==='series'){
  const groups=groupSeriesItems(win.items),metas=await mapLimit(groups.slice(0,PAGE_SIZE),4,g=>resolveSeriesGroup(req,g,c));
  log(`series-group-v183 ${spec.id} skip=${sk} sourceItems=${win.items.length} groups=${groups.length} metas=${metas.length} local=${metas.filter(m=>m.id.startsWith('sktseriesg:')).length}`);return res.json({metas:dedupMetas(metas).slice(0,PAGE_SIZE)})
 }
 let metas=await mapLimit(win.items,6,x=>resolveMeta(req,x,spec.type,c,concert));return res.json({metas:dedupMetas(metas).slice(0,PAGE_SIZE)})
}
async function findSeriesGroupById(id,c){
 const hit=seriesGroupCacheGet(id);if(hit)return hit;
 const rows=await recent(c,800,CAT.SERIES,Math.min(80,FULL_CATALOG_MAX_PAGES));for(const g of groupSeriesItems(rows)){if(g.id===id)return seriesGroupCacheSet(id,g)}return null
}
async function meta(req,res,c){
 c=authConfig(c);const{id,type}=req.params;
 if(type==='series'&&id.startsWith('sktseriesg:')){const g=await findSeriesGroupById(id,c);return res.json({meta:g?localSeriesGroupMeta(req,g):null})}
 if(/^tt\d+$/.test(id)){const cine=await cinemetaMeta(type,id);if(cine)return res.json({meta:cine});return res.json({meta:await tmdbMetaByImdb(type,id,c)})}
 if(id.startsWith('tmdb:'))return res.json({meta:await tmdbMeta(type,id,c)});
 if(type==='movie'&&(id.startsWith('skt:')||id.startsWith('sktc:'))){const tid=id.split(':')[1],all=id.startsWith('sktc:')?await recent(c,300,CAT.CONCERTS,20):await recent(c,300,0),x=all.find(v=>v.id===tid);return res.json({meta:x?await resolveMeta(req,x,'movie',c,id.startsWith('sktc:')):null})}
 if(type==='series'&&id.startsWith('sktseries:')){const tid=id.split(':')[1],all=await recent(c,500,CAT.SERIES,Math.min(50,FULL_CATALOG_MAX_PAGES)),x=all.find(v=>v.id===tid);return res.json({meta:x?await resolveMeta(req,x,'series',c,false):null})}
 return res.json({meta:null})
}
async function stream(req,res,c){
 c=authConfig(c);const{id,type}=req.params;
 if(type==='series'&&id.startsWith('sktseriesg:')){
  const p=id.split(':'),tid=p[p.length-1],season=Number(p[p.length-3])||null,ep=Number(p[p.length-2])||null,gid=p.slice(0,2).join(':'),g=await findSeriesGroupById(gid,c),x=g?.items.find(v=>v.id===tid);if(!x)return res.json({streams:[]});
  try{const td=await torrentData(x),f=chooseVideoFile(td,'series',season,ep);if(!f)return res.json({streams:[]});return res.json({streams:[makeStream(x,td,f,gid)]})}catch(e){return res.json({streams:[{name:'SKTorrent',title:e.message,externalUrl:x.detailUrl||BASE}]})}
 }
 if(/^tt\d+/.test(id)||id.startsWith('tmdb:')){try{return res.json({streams:await streamsForStandard(type,id,c)})}catch(e){log('standard stream',id,e.message);return res.json({streams:[]})}}
 const p=id.split(':'),tid=p[1],concert=id.startsWith('sktc:'),all=concert?await recent(c,300,CAT.CONCERTS,20):await recent(c,300,0),x=all.find(v=>v.id===tid);if(!x)return res.json({streams:[]});try{const td=await torrentData(x),f=chooseVideoFile(td,type);if(!f)return res.json({streams:[]});return res.json({streams:[makeStream(x,td,f,tid)]})}catch(e){return res.json({streams:[{name:'SKTorrent',title:e.message,externalUrl:x.detailUrl||BASE}]})}
}
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.3',name:'SKTorrent Katalógy',description:'SKTorrent katalógy s agregáciou seriálových epizód, lokálnym fallback detailom, odolným automatickým metadata matchingom a prehrávaním.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.3',catalogs:ALL_CATS.length,seriesEpisodeGrouping:true,localSeriesFallback:true,resilientMetadataMatching:true,fullCatalogPagination:true,pageSize:PAGE_SIZE,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
