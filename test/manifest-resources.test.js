const {test}=require('node:test');const assert=require('node:assert/strict');
const {mergeResources}=require('../manifest-resources');
test('name-keyed clients retain movie and series capability together',()=>{
 const original=[{name:'stream',types:['movie'],idPrefixes:['tt','tmdb:','sktc:','person-credit:']},{name:'stream',types:['series'],idPrefixes:['tt','tmdb:','sktseriesg:','person-credit:']}];
 const merged=mergeResources(original),indexed=Object.fromEntries(merged.map(r=>[r.name,r]));
 assert.equal(merged.length,1);assert.deepEqual(indexed.stream.types,['movie','series']);
 for(const r of original)for(const type of r.types)for(const id of r.idPrefixes){assert.ok(indexed.stream.types.includes(type));assert.ok(indexed.stream.idPrefixes.includes(id));}
 assert.equal(original[0].types.length,1);
});
test('unrestricted resources remain unrestricted',()=>{
 assert.deepEqual(mergeResources([{name:'meta'},{name:'meta',types:['movie'],idPrefixes:['tt']}]),[{name:'meta'}]);
 assert.deepEqual(mergeResources([{name:'meta',types:['movie'],idPrefixes:['tt']},'meta']),[{name:'meta'}]);
});
test('catalog descriptors and existing single resources remain unchanged',()=>{
 const original=[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie'],idPrefixes:['tt']}];
 assert.deepEqual(mergeResources(original),original);
});
