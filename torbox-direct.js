'use strict';
const crypto=require('crypto');
const API='https://api.torbox.app/v1/api';
const VIDEO_RE=/\.(mkv|mp4|m4v|avi|mov|webm|ts|m2ts)$/i;

function normHash(v){const s=String(v||'').trim().toLowerCase();return /^[a-f0-9]{40}$/.test(s)?s:null}
function authHeaders(token){return {Authorization:`Bearer ${token}`,Accept:'application/json'}}
function asList(data){if(Array.isArray(data))return data;if(data&&typeof data==='object')return[data];return[]}
function ready(item){
 if(!item)return false;
 if(item.download_present===true||item.downloadPresent===true||item.download_finished===true||item.downloadFinished===true)return true;
 const state=String(item.download_state??item.downloadState??item.state??item.status??'');
 return /cached|uploading|seeding|completed|finished|ready/i.test(state);
}
function fileName(f){return String(f?.name||f?.short_name||f?.shortName||'').replace(/\\/g,'/')}
function baseName(v){return String(v||'').replace(/\\/g,'/').split('/').pop().toLowerCase()}
function selectFile(item,stream){
 const files=Array.isArray(item?.files)?item.files:[];
 const wanted=String(stream?.behaviorHints?.filename||'').replace(/\\/g,'/');
 const wantedBase=baseName(wanted);
 let hit=null;
 if(wantedBase)hit=files.find(f=>{const n=fileName(f).toLowerCase(),b=baseName(n);return n===wanted.toLowerCase()||b===wantedBase});
 if(!hit&&Number.isInteger(stream?.fileIdx))hit=files.find(f=>Number(f?.id)===Number(stream.fileIdx))||files[stream.fileIdx]||null;
 if(!hit)hit=[...files].filter(f=>VIDEO_RE.test(fileName(f))||/^video\//i.test(String(f?.mimetype||f?.mime_type||''))).sort((a,b)=>(Number(b?.size)||0)-(Number(a?.size)||0))[0]||null;
 if(hit&&Number.isInteger(Number(hit.id)))return {id:Number(hit.id),name:fileName(hit)||wanted||null};
 if(Number.isInteger(stream?.fileIdx))return {id:Number(stream.fileIdx),name:wanted||null};
 return null;
}
async function getJson(url,opts={},fetchImpl=globalThis.fetch){
 const r=await fetchImpl(url,{...opts,signal:opts.signal||AbortSignal.timeout(9000)});
 let j=null;try{j=await r.json()}catch{}
 if(!r.ok||!j)throw new Error(`TorBox HTTP ${r.status}`);
 return j;
}
async function myList(token,{id,bypassCache=false,fetchImpl=globalThis.fetch}={}){
 const q=new URLSearchParams({limit:'1000'});if(id!=null)q.set('id',String(id));if(bypassCache)q.set('bypass_cache','true');
 const j=await getJson(`${API}/torrents/mylist?${q}`,{headers:authHeaders(token)},fetchImpl);
 if(j.success===false)throw new Error(String(j.detail||j.error||'TorBox list failed'));
 return asList(j.data);
}
async function createTorrent(token,hash,{fetchImpl=globalThis.fetch}={}){
 const form=new FormData();form.set('magnet',`magnet:?xt=urn:btih:${hash}`);form.set('seed','3');form.set('allow_zip','false');
 const j=await getJson(`${API}/torrents/createtorrent`,{method:'POST',headers:authHeaders(token),body:form},fetchImpl);
 if(j.success===false)throw new Error(String(j.detail||j.error||'TorBox create failed'));
 const d=j?.data||{},id=Number(d.torrentId??d.torrent_id);
 return Number.isInteger(id)&&id>0?id:null;
}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function ensureItem(token,hash,{fetchImpl=globalThis.fetch,list=null}={}){
 const h=normHash(hash);if(!h)return null;
 let rows=list||await myList(token,{fetchImpl});
 let item=rows.find(x=>normHash(x?.hash)===h)||null;
 if(item){
  if(ready(item))return item;
  const id=Number(item.id);
  if(Number.isInteger(id)&&id>0){
   try{const fresh=await myList(token,{id,bypassCache:true,fetchImpl});if(fresh[0])return fresh[0]}catch{}
  }
  return item;
 }
 let id=null;
 try{id=await createTorrent(token,h,{fetchImpl})}catch{}
 if(id){
  let latest=null;
  for(const ms of [0,250,500,750]){
   if(ms)await delay(ms);
   try{const one=await myList(token,{id,bypassCache:true,fetchImpl});if(one[0]){latest=one[0];if(ready(latest))return latest}}catch{}
  }
  if(latest)return latest;
 }
 try{rows=await myList(token,{bypassCache:true,fetchImpl})}catch{return null}
 return rows.find(x=>normHash(x?.hash)===h)||null;
}
function signPayload(payload,secret){
 const b=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const sig=crypto.createHmac('sha256',secret).update(b).digest('base64url');
 return `${b}.${sig}`;
}
function verifySignedPayload(value,secret){
 const [b,sig]=String(value||'').split('.');if(!b||!sig)return null;
 const expected=crypto.createHmac('sha256',secret).update(b).digest('base64url');
 const a=Buffer.from(sig),e=Buffer.from(expected);if(a.length!==e.length||!crypto.timingSafeEqual(a,e))return null;
 try{return JSON.parse(Buffer.from(b,'base64url').toString('utf8'))}catch{return null}
}
function ticket(payload,secret,ttlSeconds=3*60*60){
 const p={t:Number(payload.t),f:Number(payload.f),e:Math.floor(Date.now()/1000)+ttlSeconds};
 if(!Number.isInteger(p.t)||p.t<1||!Number.isInteger(p.f)||p.f<0)throw new Error('invalid ticket payload');
 return signPayload(p,secret);
}
function verifyTicket(value,secret){
 const p=verifySignedPayload(value,secret);
 if(!Number.isInteger(p?.t)||p.t<1||!Number.isInteger(p?.f)||p.f<0||!Number.isFinite(p?.e)||p.e<Math.floor(Date.now()/1000))return null;
 return p;
}
function pendingTicket(payload,secret,ttlSeconds=3*60*60){
 const h=normHash(payload?.h),i=Number(payload?.i),n=baseName(payload?.n||'').slice(0,240);
 const p={h,i:Number.isInteger(i)&&i>=0?i:-1,n,e:Math.floor(Date.now()/1000)+ttlSeconds};
 if(!h)throw new Error('invalid pending ticket payload');
 return signPayload(p,secret);
}
function verifyPendingTicket(value,secret){
 const p=verifySignedPayload(value,secret);
 if(!normHash(p?.h)||!Number.isInteger(p?.i)||p.i< -1||typeof p?.n!=='string'||p.n.length>240||!Number.isFinite(p?.e)||p.e<Math.floor(Date.now()/1000))return null;
 return {...p,h:normHash(p.h)};
}
function pendingStream(stream,hash,{token,publicBase}){
 const t=pendingTicket({h:hash,i:Number.isInteger(stream?.fileIdx)?stream.fileIdx:-1,n:stream?.behaviorHints?.filename||''},token);
 return {
  name:`${stream?.name||'SKTorrent'} • Preparing`,
  title:`⏳ TorBox pripravuje stream\n${stream?.title||''}`.trim(),
  url:`${String(publicBase).replace(/\/$/,'')}/wako-pending/${t}`,
  behaviorHints:{...(stream?.behaviorHints||{})}
 };
}
async function prepareStreams(streams,{token,publicBase,fetchImpl=globalThis.fetch,max=3}={}){
 if(!token||!publicBase||!Array.isArray(streams)||!streams.length)return streams||[];
 let list;try{list=await myList(token,{fetchImpl})}catch{return streams}
 const out=[];let converted=0;
 for(const s of streams){
  const h=normHash(s?.infoHash);
  if(!h||converted>=max){out.push(s);continue}
  let item;try{item=await ensureItem(token,h,{fetchImpl,list})}catch{item=null}
  if(!item||!ready(item)){
   out.push(pendingStream(s,h,{token,publicBase}));
   converted++;
   continue;
  }
  const f=selectFile(item,s);if(!f){out.push(pendingStream(s,h,{token,publicBase}));converted++;continue}
  const id=Number(item.id);if(!Number.isInteger(id)||id<1){out.push(pendingStream(s,h,{token,publicBase}));converted++;continue}
  const t=ticket({t:id,f:f.id},token);
  out.push({name:`${s.name||'SKTorrent'} • Direct`,title:`▶ Priame prehranie cez TorBox\n${s.title||''}`.trim(),url:`${String(publicBase).replace(/\/$/,'')}/wako-direct/${t}`,behaviorHints:{...(s.behaviorHints||{}),...(f.name?{filename:f.name}:{})}});
  converted++;
 }
 return out;
}
async function resolvePending(token,payload,{fetchImpl=globalThis.fetch,attempts=6,delayMs=1000}={}){
 const h=normHash(payload?.h);if(!h)return null;
 const stream={...(payload?.i>=0?{fileIdx:payload.i}:{}),behaviorHints:{...(payload?.n?{filename:payload.n}:{})}};
 for(let attempt=0;attempt<attempts;attempt++){
  let item=null;try{item=await ensureItem(token,h,{fetchImpl})}catch{}
  if(item&&ready(item)){
   const id=Number(item.id),f=selectFile(item,stream);
   if(Number.isInteger(id)&&id>0&&f)return {torrentId:id,fileId:f.id,filename:f.name||null};
  }
  if(attempt<attempts-1)await delay(delayMs);
 }
 return null;
}
async function requestDownloadUrl(token,torrentId,fileId,{fetchImpl=globalThis.fetch}={}){
 const q=new URLSearchParams({token,torrent_id:String(torrentId),file_id:String(fileId),redirect:'false',append_name:'true'});
 const j=await getJson(`${API}/torrents/requestdl?${q}`,{headers:authHeaders(token)},fetchImpl);
 const u=String(j?.data||'');let parsed;try{parsed=new URL(u)}catch{return null}
 return parsed.protocol==='https:'?u:null;
}
module.exports={normHash,ready,selectFile,myList,createTorrent,ensureItem,ticket,verifyTicket,pendingTicket,verifyPendingTicket,pendingStream,prepareStreams,resolvePending,requestDownloadUrl};
