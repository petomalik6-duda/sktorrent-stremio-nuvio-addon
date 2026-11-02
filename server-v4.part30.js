
// v2.1.3: narrow, temporary request-contract diagnostics for the reported concert.
// Never log tokens, URLs, headers, credentials, or returned media URLs.
const playbackContractIds=new Set(['tmdb:671575','sktc:2c06eefc81b03b861c97292001da670f1ba4b0b2','sktv:2c06eefc81b03b861c97292001da670f1ba4b0b2']);
function tracePlaybackContract(handler,resource){
 return async function(req,res,c){
  const json=res.json;
  res.json=function(body){
   const item=body?.meta||(Array.isArray(body?.metas)?body.metas.find(m=>playbackContractIds.has(m?.id)):null);
   if(playbackContractIds.has(req.params.id)||item&&playbackContractIds.has(item.id)){
    const client=(String(req.get('user-agent')||'').match(/nuvio|wako|aiostreams|selection/i)||['other'])[0].toLowerCase();
    log('playback-contract',JSON.stringify({resource,client,requestedType:req.params.type,requestedId:req.params.id,returnedType:item?.type,returnedId:item?.id,defaultVideoId:item?.behaviorHints?.defaultVideoId,videoIds:item?.videos?.slice(0,3).map(v=>v.id),streamCount:Array.isArray(body?.streams)?body.streams.length:undefined}));
   }
   return json.call(this,body);
  };
  try{return await handler(req,res,c)}finally{res.json=json}
 };
}
catalog=tracePlaybackContract(catalog,'catalog');
meta=tracePlaybackContract(meta,'meta');
stream=tracePlaybackContract(stream,'stream');
const playbackContractManifestBase=manifest;
manifest=function(){return {...playbackContractManifestBase(),version:'2.1.3'}};
