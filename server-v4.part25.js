
// v2.0.0 critical pagination fix: SKTorrent may return a non-empty repeated page
// for an out-of-range page number. The old rows.length<10 end condition therefore
// scanned all the way to FULL_CATALOG_MAX_PAGES (often page=999).
function perfV2PageSignature(rows){return (rows||[]).map(x=>String(x?.id||'')).filter(Boolean).join('|')}

perfV2NewIndex=function(id){
 return{
  id,createdAt:Date.now(),lastAccess:Date.now(),seen:new Map(),ordered:[],fetchedPages:0,inflight:null,
  states:catalogSourceCategories(id).map(category=>({category,page:0,done:false,tail:Infinity,pageSignatures:new Set(),itemIds:new Set(),noProgress:0}))
 }
};

perfV2GrowIndex=async function(s,c,need){
 while(!perfV2IndexReady(s,need)&&s.fetchedPages<FULL_CATALOG_MAX_PAGES){
  const jobs=[];
  for(const st of s.states.filter(v=>!v.done)){
   st.pageSignatures ||= new Set();st.itemIds ||= new Set();st.noProgress ||= 0;
   for(let i=0;i<FULL_CATALOG_FETCH_BATCH&&s.fetchedPages+jobs.length<FULL_CATALOG_MAX_PAGES;i++){
    const page=st.page+i;
    jobs.push({st,page,p:fetchPage(page,c,st.category).then(rows=>({rows})).catch(error=>({rows:[],error}))})
   }
  }
  if(!jobs.length)break;
  const results=await Promise.all(jobs.map(async j=>({...j,...await j.p})));
  for(const r of results.sort((a,b)=>a.page-b.page)){
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

// Route all legacy full-history callers (including the debug probe) through the
// persistent v2 index so they benefit from repeat-page detection and shared work.
fullCatalogWindow=async function(id,c={},skip=0,count=80){return perfV2CatalogWindow(id,c,skip,count)};
