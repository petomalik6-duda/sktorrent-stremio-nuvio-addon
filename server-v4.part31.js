
// v2.2.11: keep the last-known-good Wako identity contract, infer Wako
// sessions even when the app calls the standard addon routes, and convert
// ready SKTorrent infoHash streams into normal HTTPS playback URLs through
// the user's own TorBox account. Missing torrents are auto-added and then
// refreshed with bypass_cache so cached items can become Direct immediately.
require('./wako-mode').install(app);
const torboxDirect=require('./torbox-direct');
const wakoTorboxToken=String(process.env.TORBOX_API_TOKEN||'').trim();
log(`Wako TorBox bridge configured=${Boolean(wakoTorboxToken)}`);
const wakoDirectStreamBase=stream;
stream=async function(req,res,c){
 const json=res.json;
 res.json=async function(body){
  if(req?.sktWakoCompat&&wakoTorboxToken&&Array.isArray(body?.streams)){
   const before=body.streams;
   const after=await torboxDirect.prepareStreams(before,{token:wakoTorboxToken,publicBase:baseUrl(req)});
   const direct=after.filter(s=>typeof s?.url==='string'&&/\/wako-direct\//.test(s.url)).length;
   log(`Wako TorBox conversion attempted original=${before.length} direct=${direct}`);
   body={...body,streams:after};
   res.set('Cache-Control','private, no-store');
  }
  return json.call(this,body);
 };
 try{return await wakoDirectStreamBase(req,res,c)}finally{res.json=json}
};

app.get('/wako-direct/:ticket',async(req,res)=>{
 if(!wakoTorboxToken)return res.status(503).send('Direct playback is not configured');
 const p=torboxDirect.verifyTicket(req.params.ticket,wakoTorboxToken);
 if(!p)return res.status(403).send('Invalid or expired playback link');
 try{
  const u=await torboxDirect.requestDownloadUrl(wakoTorboxToken,p.t,p.f);
  if(!u)return res.status(502).send('TorBox did not return a playable URL');
  res.set('Cache-Control','private, no-store');
  return res.redirect(302,u);
 }catch(e){
  log('Wako TorBox direct redirect failed',e.message);
  return res.status(502).send('TorBox direct playback unavailable');
 }
});
app.get('/debug/wako-direct',(_q,r)=>r.json({ok:true,configured:Boolean(wakoTorboxToken),mode:'server-side-torbox-redirect'}));

const kabatTorboxHash='2c06eefc81b03b861c97292001da670f1ba4b0b2';
async function getSafeKabatTorboxState(){
 if(!wakoTorboxToken)return {ok:false,configured:false};
 try{
  const rows=await torboxDirect.myList(wakoTorboxToken,{bypassCache:true});
  const item=rows.find(x=>torboxDirect.normHash(x?.hash)===kabatTorboxHash)||null;
  if(!item)return {ok:true,configured:true,found:false};
  const state=String(item.download_state??item.downloadState??item.state??item.status??'');
  const files=Array.isArray(item.files)?item.files:[];
  return {
   ok:true,configured:true,found:true,
   id:Number(item.id)||null,
   state,
   ready:torboxDirect.ready(item),
   downloadPresent:item.download_present===true||item.downloadPresent===true,
   downloadFinished:item.download_finished===true||item.downloadFinished===true,
   files:files.length,
   hasVideo:files.some(f=>/\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts)$/i.test(String(f?.name||f?.short_name||f?.shortName||'')))
  };
 }catch(e){
  return {ok:false,configured:true,error:String(e?.message||e).slice(0,120)};
 }
}

// Safe one-title production diagnostic. Never returns the API token, URLs,
// headers, filenames, or any account-wide torrent data.
app.get('/debug/wako-torbox-kabat',async(_q,r)=>{
 const state=await getSafeKabatTorboxState();
 return r.status(state.ok?200:502).json(state);
});

if(wakoTorboxToken){
 const t=setTimeout(async()=>{
  const state=await getSafeKabatTorboxState();
  log('Wako TorBox Kabat state',JSON.stringify(state));
 },5000);
 if(typeof t.unref==='function')t.unref();
}

const wakoModeManifestBase=manifest;
manifest=function(){return {...wakoModeManifestBase(),version:'2.2.11'}};
