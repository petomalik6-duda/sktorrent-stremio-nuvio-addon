
// v2.0.0: use the configured SKTorrent login for catalog/search page requests.
// SKTorrent currently exposes some categories as empty to guests, while an
// authenticated session can access them. Previous fetchPage() ignored the
// encrypted per-user credentials and therefore forced expensive category=0 scans.
function perfV2PageAuthScope(c={}){
 const a=authConfig(c);
 if(a.sktUser&&a.sktPass)return `user:${authFingerprint(a)}`;
 return cookieHeader()?'server':'guest'
}
async function perfV2CatalogCookie(c={},force=false){
 const a=authConfig(c);
 if(a.sktUser&&a.sktPass)return configuredCookie(a,force);
 return cookieHeader()
}
function perfV2ParsePage(html,category){
 const $=cheerio.load(html),map=new Map();
 $('a[href^="details.php"]').each((_,el)=>{
  const x=parseAnchor($,el,category);if(!x)return;
  const old=map.get(x.id);if(!old||x.name.length>old.name.length||(!old.poster&&x.poster))map.set(x.id,{...old,...x})
 });
 return [...map.values()]
}
async function perfV2FetchPageNetwork(p,c,category,search,cookie){
 const r=await axios.get(SEARCH,{
  timeout:12000,maxRedirects:5,httpAgent,httpsAgent,
  params:{active:0,category,order:'data',by:'DESC',page:p,...(search?{search}:{})},
  headers:{...baseHeaders(BASE+'/torrent/'),...(cookie?{Cookie:cookie}:{})}
 });
 return perfV2ParsePage(r.data,category)
}
fetchPage=async function(p,c={},category=0,search=''){
 c=authConfig(c);
 const scope=perfV2PageAuthScope(c),searchKey=crypto.createHash('sha1').update(String(search||'')).digest('hex').slice(0,12),key=`page-v2:${scope}:${category}:${p}:${searchKey}`;
 return cached(key,TTL,async()=>{
  let cookie=await perfV2CatalogCookie(c,false),out=await perfV2FetchPageNetwork(p,c,category,search,cookie);
  // A protected category returning an empty first page is a common symptom of an
  // expired login session. Refresh once before accepting the empty result.
  const protectedCategory=category!==0&&category!==CAT.CONCERTS;
  if(!out.length&&p===0&&protectedCategory&&c.sktUser&&c.sktPass){
   try{
    cookie=await perfV2CatalogCookie(c,true);
    out=await perfV2FetchPageNetwork(p,c,category,search,cookie)
   }catch(e){log('catalog relogin',category,e.message)}
  }
  log(`SKTorrent page=${p} category=${category} auth=${scope==='guest'?'guest':'yes'} search=${search||'-'} parsed=${out.length}`);
  return out
 })
};

// v2.0.1: People filmography bridge. Nuvio exposes a person profile as a
// synthetic series, so each filmography entry carries its real target in
// person-credit:<movie|series>:<tmdbId>. Resolve it through the Discovery addon
// and feed the canonical IMDb/TMDB id back into the existing SKTorrent stream path.
const PERF_V2_PEOPLE_DISCOVERY_BASE=String(process.env.PEOPLE_DISCOVERY_BASE_URL||'https://stremio-csfd-discovery-addon.onrender.com').replace(/\/$/,'');
function perfV2PersonCreditTarget(id){const m=String(id||'').match(/^person-credit:(movie|series):(\d+)$/i);return m?{type:m[1].toLowerCase(),tmdbId:Number(m[2])}:null}
async function perfV2ResolvePersonCredit(id){
 const t=perfV2PersonCreditTarget(id);if(!t)return null;
 const key=`people-credit:${t.type}:${t.tmdbId}`,old=successfulCacheGet(key);if(old)return old;
 let canonical=`tmdb:${t.tmdbId}`;
 try{
  const r=await metadataGet(`${PERF_V2_PEOPLE_DISCOVERY_BASE}/meta/${t.type}/tmdb:${t.type}:${t.tmdbId}.json`,{headers:{Accept:'application/json','User-Agent':'SKTorrent-PeopleBridge/2.0.1'}},`People bridge ${t.type}:${t.tmdbId}`),m=r.data?.meta||null;
  if(/^tt\d+$/.test(String(m?.id||'')))canonical=String(m.id)
 }catch(e){log('people bridge metadata',id,e.message)}
 return successfulCacheSet(key,{...t,standardId:canonical})
}
const perfV2PeopleStreamBase=stream;
stream=async function(req,res,c){
 const bridge=perfV2PersonCreditTarget(req.params.id);
 if(!bridge)return perfV2PeopleStreamBase(req,res,c);
 try{
  const target=await perfV2ResolvePersonCredit(req.params.id);
  if(!target)return res.json({streams:[]});
  const streams=await streamsForStandard(target.type,target.standardId,authConfig(c));
  log(`people-stream type=${target.type} id=${target.standardId} count=${streams.length}`);
  return res.json({streams})
 }catch(e){log('people stream',req.params.id,e.message);return res.json({streams:[]})}
};
const perfV2PeopleManifestBase=manifest;
manifest=function(){
 const m=perfV2PeopleManifestBase();
 m.version='2.0.1';
 m.description=String(m.description||'SKTorrent Katalógy')+' Podpora People filmografie cez person-credit bridge.';
 m.idPrefixes=[...new Set([...(m.idPrefixes||[]),'person-credit:'])];
 m.resources=(m.resources||[]).map(r=>r&&typeof r==='object'&&r.name==='stream'?{...r,idPrefixes:[...new Set([...(r.idPrefixes||[]),'person-credit:'])]}:r);
 return m
};
app.get('/debug/people-credit/:type/:tmdbId',async(q,r)=>{try{const id=`person-credit:${q.params.type}:${q.params.tmdbId}`,target=await perfV2ResolvePersonCredit(id);r.json({ok:Boolean(target),id,target})}catch(e){r.status(502).json({ok:false,error:e.message})}});
