
// v2.1.2: explicit movie identity at the catalog/meta response boundary.
const movieIdentityCompat=require('./movie-contract');
const movieIdentityResolveBase=resolveMeta;
resolveMeta=async function(...args){return movieIdentityCompat.movieContract(await movieIdentityResolveBase(...args))};
const movieIdentityMetaBase=meta;
meta=async function(req,res,c){
 const json=res.json;
 res.json=function(body){return json.call(this,body?.meta?{...body,meta:movieIdentityCompat.movieContract(body.meta,true)}:body)};
 try{return await movieIdentityMetaBase(req,res,c)}finally{res.json=json}
};
const movieIdentityManifestBase=manifest;
manifest=function(){return {...movieIdentityManifestBase(),version:'2.1.2'}};
const movieIdentityHealthBase=app._router.stack.find(x=>x.route?.path==='/health'&&x.route.methods.get)?.route.stack[0].handle;
if(movieIdentityHealthBase){
 removeRoute('/health','get');
 app.get('/health',(q,r)=>{const json=r.json;r.json=function(body){return json.call(this,{...body,version:'2.1.2',explicitMovieIdentity:true})};return movieIdentityHealthBase(q,r)});
}
