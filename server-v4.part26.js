
// v2.0.0: scan film catalogs from the actual SKTorrent movie categories instead
// of category=0 (the entire tracker). Category IDs match the current SKTorrent
// category map used by maintained client integrations.
const PERF_V2_MOVIE_CATEGORIES=[1,5,14,15,20,31,3,19,28,29,43];
const PERF_V2_INDEX_REQUEST_CONCURRENCY=Math.max(2,Math.min(12,Number(process.env.CATALOG_FETCH_CONCURRENCY||6)||6));

catalogSourceCategories=function(id){
 switch(id){
  case'skt-novinky-dabing-filmy':return[CAT.DABING];
  case'skt-novinky-dabing-serialy':case'skt-serialy-czsk':case'skt-posledne-serialy':return[CAT.SERIES];
  case'skt-4k-uhd-czsk':return[CAT.UHD,CAT.DABING];
  case'skt-nove-koncerty':case'skt-posledne-koncerty':case'skt-4k-uhd-koncerty':return[CAT.CONCERTS];
  case'skt-filmove-novinky':case'skt-posledne-filmy':return PERF_V2_MOVIE_CATEGORIES;
  default:return[0]
 }
};

// Recreate indexes with the final source map. Sort by page before each batch so
// every category advances evenly; this is required to preserve global date order.
perfV2NewIndex=function(id){
 return{
  id,createdAt:Date.now(),lastAccess:Date.now(),seen:new Map(),ordered:[],fetchedPages:0,inflight:null,
  states:catalogSourceCategories(id).map(category=>({category,page:0,done:false,tail:Infinity,pageSignatures:new Set(),itemIds:new Set(),noProgress:0}))
 }
};

perfV2GrowIndex=async function(s,c,need){
 while(!perfV2IndexReady(s,need)&&s.fetchedPages<FULL_CATALOG_MAX_PAGES){
  const active=s.states.filter(v=>!v.done).sort((a,b)=>a.page-b.page||a.category-b.category);
  if(!active.length)break;
  const selected=active.slice(0,PERF_V2_INDEX_REQUEST_CONCURRENCY);
  const jobs=selected.map(st=>{
   st.pageSignatures ||= new Set();st.itemIds ||= new Set();st.noProgress ||= 0;
   const page=st.page;
   return{st,page,p:fetchPage(page,c,st.category).then(rows=>({rows})).catch(error=>({rows:[],error}))}
  });
  const results=await Promise.all(jobs.map(async j=>({...j,...await j.p})));
  for(const r of results){
   const st=r.st;s.fetchedPages++;st.page=Math.max(st.page,r.page+1);
   if(r.error){log('perf-index page',s.id,st.category,r.page,r.error.message);st.done=true;continue}
   const rows=r.rows||[],signature=perfV2PageSignature(rows),repeated=Boolean(signature&&st.pageSignatures.has(signature));
   let newInCategory=0;
   for(const x of rows){
    if(!st.itemIds.has(x.id)){st.itemIds.add(x.id);newInCategory++}
    if(!s.seen.has(x.id)&&filter(s.id,[x]).length)s.seen.set(x.id,x)
   }
   if(signature)st.pageSignatures.add(signature);
   if(rows.length){const times=rows.map(itemTime).filter(Boolean);if(times.length)st.tail=Math.min(st.tail,...times)}
   st.noProgress=newInCategory===0?st.noProgress+1:0;
   if(rows.length<10||repeated||st.noProgress>=1){
    st.done=true;
    log(`perf-index end id=${s.id} category=${st.category} page=${r.page} rows=${rows.length} repeated=${repeated} new=${newInCategory}`)
   }
  }
  s.ordered=[...s.seen.values()].sort((a,b)=>itemTime(b)-itemTime(a));
 }
};

// Expose the final source map in health/debug output for regression checks.
app.get('/debug/v2-sources/:id',(q,r)=>r.json({ok:true,id:q.params.id,categories:catalogSourceCategories(q.params.id),movieCategories:PERF_V2_MOVIE_CATEGORIES,concurrency:PERF_V2_INDEX_REQUEST_CONCURRENCY}));
