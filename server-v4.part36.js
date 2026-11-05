
// Regression fix: never let an automatic metadata provider rename SKTorrent
// concert catalog entries. The exact original release distinguishes editions,
// e.g. Eric Clapton Crossroads 2007 vs 2010 vs 2013.
// Intentionally not changing the standard ID / stream aggregation pipeline.
// The overly broad metadata identification in part35 is disabled in package.json.

const originalConcertTitleResolveMeta=resolveMeta;
resolveMeta=async function(req,x,type,c,concert=false){
 const m=await originalConcertTitleResolveMeta(req,x,type,c,concert);
 if(!m||type!=='movie'||!concert||!x?.name)return m;
 // Keep the manually verified Dolly fix's precise official name.
 if(typeof isDollyPartonOpry50==='function'&&isDollyPartonOpry50(x))return m;
 const title=cleanConcertReleaseTitle(x.name)||displayTitle(x.name);
 if(title&&m.name!==title){
  log('concert preserve release title',String(x.id||''),m.name,'=>',title);
  m.name=title;
 }
 return m
};
