
// v2.1.1: one descriptor per resource name prevents movie/series overwrite.
const manifestResourcesCompat=require('./manifest-resources');
const manifestV211Base=manifest;
manifest=function(){
 const m=manifestV211Base();
 return {...m,version:'2.1.1',resources:manifestResourcesCompat.mergeResources(m.resources)};
};
const healthV211Base=app._router.stack.find(layer=>layer.route?.path==='/health'&&layer.route.methods.get)?.route.stack[0].handle;
if(healthV211Base){
 removeRoute('/health','get');
 app.get('/health',(q,r)=>{
  const json=r.json;
  r.json=function(body){return json.call(this,{...body,version:'2.1.1',uniqueManifestResources:true})};
  return healthV211Base(q,r);
 });
}
app.get('/debug/manifest-resources',(_q,r)=>{
 const m=manifest();
 r.json({ok:new Set(m.resources.map(x=>x.name)).size===m.resources.length,version:m.version,resources:m.resources});
});
