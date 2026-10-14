
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
