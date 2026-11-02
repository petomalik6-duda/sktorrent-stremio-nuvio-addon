'use strict';
// Some clients normalize resource objects by name. Advertise each resource once
// so movie support is not overwritten by the later series descriptor.
function mergeResources(resources) {
 const merged=new Map();
 for(const resource of resources||[]) {
  const r=typeof resource==='string'?{name:resource}:resource;
  if(!r||typeof r.name!=='string')continue;
  const previous=merged.get(r.name);
  if(!previous){merged.set(r.name,{...r});continue;}
  const combined={...previous};
  for(const key of ['types','idPrefixes']) {
   // An omitted restriction means unrestricted, rather than an empty union.
   if(!Array.isArray(previous[key])||!previous[key].length||!Array.isArray(r[key])||!r[key].length) delete combined[key];
   else combined[key]=[...new Set([...previous[key],...r[key]])];
  }
  merged.set(r.name,combined);
 }
 return [...merged.values()];
}
module.exports={mergeResources};
