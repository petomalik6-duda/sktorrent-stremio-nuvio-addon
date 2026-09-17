
// v1.8.4: stream language flags and subtitle information
const STREAM_LANGS=[
 {code:'CZ',flag:'🇨🇿',tokens:['CZ','CZE','CES','CZECH','ČESKY','ČESKÝ','CESKY','CESKY']},
 {code:'SK',flag:'🇸🇰',tokens:['SK','SVK','SLOVAK','SLOVENSKY','SLOVENSKÝ','SLOVENSKY']},
 {code:'EN',flag:'🇬🇧',tokens:['EN','ENG','ENGLISH']},
 {code:'DE',flag:'🇩🇪',tokens:['GER','DEU','GERMAN','DEUTSCH']},
 {code:'PL',flag:'🇵🇱',tokens:['POL','POLISH','POLSKI']},
 {code:'HU',flag:'🇭🇺',tokens:['HUN','HUNGARIAN','MAGYAR']},
 {code:'FR',flag:'🇫🇷',tokens:['FRE','FRA','FRENCH','FRANCAIS','FRANÇAIS']},
 {code:'ES',flag:'🇪🇸',tokens:['SPA','SPANISH','ESPANOL','ESPAÑOL']},
 {code:'IT',flag:'🇮🇹',tokens:['ITA','ITALIAN','ITALIANO']}
];
function streamTokenText(s){return ` ${String(s||'').replace(/[._()\[\]{}\\|,:;+-]+/g,' ').replace(/\//g,' / ').replace(/\s+/g,' ').trim()} `}
function hasLangToken(text,token){const escToken=String(token).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return new RegExp(`(?:^|[^A-Za-z0-9])${escToken}(?:[^A-Za-z0-9]|$)`,token.length<=2?'':'i').test(text)}
function detectStreamLangs(text){const s=streamTokenText(text),out=[];for(const l of STREAM_LANGS){if(l.tokens.some(t=>hasLangToken(s,t)))out.push(l)}return out}
function subtitlePhraseMatches(text){
 const src=String(text||''),matches=[];
 const lang='(?:CZ|CZE|CES|CZECH|SK|SVK|SLOVAK|EN|ENG|ENGLISH|GER|DEU|GERMAN|POL|POLISH|HUN|HUNGARIAN|FRE|FRA|FRENCH|SPA|SPANISH|ITA|ITALIAN)';
 const list=`${lang}(?:\\s*[/,+&]\\s*${lang})*`;
 const regs=[new RegExp(`${list}\\s*(?:titulky?|tit\\.?|subs?|subtitles?)`,'gi'),new RegExp(`(?:titulky?|tit\\.?|subs?|subtitles?)\\s*[:=-]?\\s*${list}`,'gi')];
 for(const re of regs)for(const m of src.matchAll(re))matches.push(m[0]);return matches
}
function streamLanguageInfo(x,td,f){
 const raw=[x?.name,f?.path].filter(Boolean).join(' | '),subPhrases=subtitlePhraseMatches(raw),subLangs=new Map();
 for(const p of subPhrases)for(const l of detectStreamLangs(p))subLangs.set(l.code,l);
 let audioText=raw;for(const p of subPhrases)audioText=audioText.replace(p,' ');
 const audioLangs=detectStreamLangs(audioText),subFiles=(td?.files||[]).filter(v=>/\.(srt|ass|ssa|sub|vtt)$/i.test(v.path||''));
 for(const sf of subFiles)for(const l of detectStreamLangs(sf.path))subLangs.set(l.code,l);
 const genericSubs=Boolean(subPhrases.length||subFiles.length||/(?:^|[\s._\[(])(subs?|subtitles?|titulky?|tit\.)(?:$|[\s._\])])/i.test(raw));
 return{audio:audioLangs,subs:[...subLangs.values()],hasSubs:genericSubs}
}
function streamLangLabels(info){return info.audio.map(l=>`${l.flag} ${l.code}`)}
function streamSubLabel(info){if(info.subs.length)return `💬 ${info.subs.map(l=>`${l.flag} ${l.code}`).join(' ')}`;return info.hasSubs?'💬 titulky':''}
function makeStream(x,td,f,base){
 const quality=is4k(x)?'4K/UHD':/1080p/i.test(x.name)?'1080p':/720p/i.test(x.name)?'720p':'Video',info=streamLanguageInfo(x,td,f),langs=streamLangLabels(info),subs=streamSubLabel(info),badges=[quality,...langs,subs].filter(Boolean);
 const details=[x.size,`${x.seeds} seed`].filter(Boolean).join(' • '),media=[langs.length?`Audio: ${langs.join(' ')}`:'',subs?`Titulky: ${subs.replace(/^💬\s*/, '')}`:''].filter(Boolean).join(' • ');
 return{name:`SKTorrent • ${badges.join(' • ')}`,title:[x.name,details,media].filter(Boolean).join('\n'),infoHash:td.hash,fileIdx:f.index,behaviorHints:{filename:f.path,bingeGroup:`skt-${base}`}}
}
function manifest(){return{id:'community.sktorrent.catalogs',version:'1.8.4',name:'SKTorrent Katalógy',description:'SKTorrent katalógy s agregáciou seriálových epizód, lokálnym fallback detailom, jazykovými vlajkami a informáciami o titulkoch v streamoch.',resources:[{name:'catalog',types:['movie','series']},{name:'meta',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:']},{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:']}],types:['movie','series'],catalogs:ALL_CATS.map(c=>({...c,search:undefined,concert:undefined,extra:c.search?[{name:'search',isRequired:true},{name:'skip',isRequired:false}]:[{name:'skip',isRequired:false}]})),idPrefixes:['tt','tmdb:','skt:','sktc:','sktseries:','sktseriesg:','sktv:','sktf:'],behaviorHints:{configurable:true,configurationRequired:false}}}
removeRoute('/health','get');
app.get('/health',(_q,r)=>r.json({ok:true,addon:'SKTorrent Katalógy',version:'1.8.4',catalogs:ALL_CATS.length,seriesEpisodeGrouping:true,localSeriesFallback:true,streamLanguageFlags:true,streamSubtitleInfo:true,resilientMetadataMatching:true,fullCatalogPagination:true,pageSize:PAGE_SIZE,usernamePasswordLogin:true,encryptedLoginToken:true,at:new Date().toISOString()}));
app.get('/debug/stream-label',(_q,r)=>{const samples=['Film.Name.2026.(CZ/EN).1080p.WEB-DL.mkv','Serial.S01E02.SK.720p.mkv','Movie.2026.EN.CZ titulky.2160p.mkv'];r.json({ok:true,samples:samples.map(name=>({name,info:streamLanguageInfo({name},{files:[]},{path:name})}))})});
