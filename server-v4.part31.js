
// v2.2.9: keep the last-known-good Wako identity contract and optionally
// convert ready SKTorrent infoHash streams into normal HTTPS playback URLs
// through the user's own TorBox account. The API token stays server-side.
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
   if(direct)log(`Wako TorBox direct streams=${direct} original=${before.length}`);
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

const wakoModeManifestBase=manifest;
manifest=function(){return {...wakoModeManifestBase(),version:'2.2.9'}};
