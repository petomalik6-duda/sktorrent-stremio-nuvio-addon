'use strict';
const express=require('express');
const cors=require('cors');
const axios=require('axios');
const cheerio=require('cheerio');
const bencode=require('bncode');
const crypto=require('crypto');
const http=require('http');
const https=require('https');

const PORT=Number(process.env.PORT||7000);
const BASE='https://sktorrent.eu';
const SEARCH=`${BASE}/torrent/torrents_v2.php`;
const TTL=Number(process.env.CACHE_TTL_SECONDS||600)*1000;
const META_TTL=6*60*60*1000;
const PAGE_SIZE=40;
const CAT={DABING:1,KRESLENE:5,SERIES:16,CONCERTS:26,UHD:43};
const cache=new Map();
const httpAgent=new http.Agent({keepAlive:true,maxSockets:40});
const httpsAgent=new https.Agent({keepAlive:true,maxSockets:40});

const CATS=[
 ['movie','skt-novinky-dabing-filmy','🆕 SKT: Novinky CZ/SK dabing – filmy'],
 ['series','skt-novinky-dabing-serialy','🆕 SKT: Novinky CZ/SK dabing – seriály'],
 ['series','skt-serialy-czsk','🇨🇿🇸🇰 SKT: Seriály – CZ/SK dabing'],
 ['movie','skt-4k-uhd-czsk','💎 SKT: 4K / UHD CZ/SK'],
 ['movie','skt-filmove-novinky','🎬 SKT: Filmové novinky'],
 ['movie','skt-posledne-filmy','🕒 SKT: Posledné pridané filmy'],
 ['series','skt-posledne-serialy','🕒 SKT: Posledné pridané seriály'],
 ['movie','skt-nove-koncerty','🎤 SKT: Nové koncerty'],
 ['movie','skt-posledne-koncerty','🎶 SKT: Posledné pridané koncerty'],
 ['movie','skt-4k-uhd-koncerty','✨ SKT: 4K / UHD koncerty']
].map(([type,id,name])=>({type,id,name}));

const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const nodiac=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const abs=u=>{try{return u?new URL(u,SEARCH).href:null}catch{return null}};
const dec=t=>{try{return t&&t!=='default'?JSON.parse(Buffer.from(t,'base64url').toString('utf8')):{}}catch{return{}}};
const log=(...a)=>console.log(new Date().toISOString(),...a);
async function cached(k,ttl,fn){const h=cache.get(k);if(h&&h.e>Date.now())return h.v;const v=await fn();cache.set(k,{v,e:Date.now()+ttl});return v}
const pages=c=>Math.max(1,Math.min(20,Number(c.pages||8)||8));
function cookieHeader(){return process.env.SKT_UID&&process.env.SKT_PASS?`uid=${process.env.SKT_UID}; pass=${process.env.SKT_PASS}`:null}
function client(){const cookie=cookieHeader();return axios.create({timeout:12000,maxRedirects:5,httpAgent,httpsAgent,headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36','Accept-Language':'sk,cs;q=0.9,en;q=0.7',Referer:BASE+'/',...(cookie?{Cookie:cookie}:{})}})}
function dateFrom(t){const m=String(t).match(/Pridany\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);return m?new Date(Date.UTC(+m[3],+m[2]-1,+m[1],12)):null}
function yearFrom(t){const y=new Date().getUTCFullYear(),a=[...String(t).matchAll(/\b(19\d{2}|20\d{2})\b/g)].map(m=>+m[1]).filter(x=>x<=y+1);return a.at(-1)||null}
function displayTitle(s){return clean(s).replace(/^Stiahni si\s*/i,'').replace(/\s*=\s*CSFD\s*\d+%.*$/i,'').trim()||'SKTorrent'}
function stripCatPrefix(name,cat){let n=displayTitle(name),c=clean(cat);if(c&&n.toLowerCase().startsWith(c.toLowerCase()))n=clean(n.slice(c.length).replace(/^[-:|]+/,' '));return n||displayTitle(name)}
function lookupCandidates(raw){let s=displayTitle(raw)
 .replace(/^((filmy\s+cz\/sk\s+dabing|uhd\s+filmy|filmy\s+hd|filmy\s+kreslene|serial|seri[aá]l|hudebni\s+videa)\s+)/i,' ')
 .replace(/\[[^\]]*\]/g,' ')
 .replace(/\((?:CZ|SK|EN|CZ\/EN|SK\/EN|CZ\/SK|SK\/CZ|CZ\/SK\/EN)[^)]*\)/gi,' ')
 .replace(/\bS\d{1,2}(?:E\d{1,3})?\b/gi,' ')
 .replace(/\b\d{1,2}x\d{1,3}\b/gi,' ')
 .replace(/\b(2160p|1080p|720p|4k|uhd|hdr10\+?|hdr|dolby\s*vision|dv|hevc|x265|x264|web-?dl|webrip|blu-?ray|bdrip|tvrip|remux|h\.?264|h\.?265|full\s*dvdrip|mp4|mkv)\b/gi,' ')
 .replace(/\s+/g,' ').trim();
 const parts=s.split(/\s+(?:\/|\/\/|\|)\s+/).map(x=>x.trim()).filter(Boolean),out=[];
 for(const p of [...parts,s]){const q=p.replace(/\((?:19\d{2}|20\d{2})(?:\s*[-–]\s*(?:19\d{2}|20\d{2}))?\)/g,' ').replace(/\b(?:19\d{2}|20\d{2})\b/g,' ').replace(/\s+/g,' ').trim();if(q.length>1&&!out.includes(q))out.push(q)}
 return out.slice(0,3)
}
const lookupTitle=n=>lookupCandidates(n)[0]||displayTitle(n);
function posterFromCell($,cell){let out=null;cell.find('img').each((_,im)=>{if(out)return;const el=$(im);for(const k of ['data-src','data-original','data-lazy-src','src']){const u=abs(el.attr(k));if(!u)continue;const l=u.toLowerCase();if(l.includes('/flag/')||l.includes('/flags/')||l.includes('spacer')||l.includes('pixel')||l.endsWith('.gif')||l.includes('category')||l.includes('logo'))continue;out=u;break}});return out}
function parseAnchor($,el,forcedCat=0){const a=$(el),href=a.attr('href')||'',m=href.match(/[?&]id=([^&]+)/);if(!m)return null;const cell=a.closest('td');if(!cell.length)return null;const text=clean(cell.text());let category=clean(cell.find('a[href*="category="]').first().text())||clean(cell.find('b').first().text());if(!category){if(forcedCat===CAT.CONCERTS)category='Hudební videa';if(forcedCat===CAT.SERIES)category='Seriál';if(forcedCat===CAT.DABING)category='Filmy CZ/SK dabing';if(forcedCat===CAT.UHD)category='UHD Filmy';if(forcedCat===CAT.KRESLENE)category='Filmy Kreslené'}let name=clean(a.attr('title'))||clean(a.text())||clean(a.find('img').first().attr('alt'));if(!name||/^(image|cz|sk|en|de|pl|hu)$/i.test(name))return null;name=stripCatPrefix(name,category);const d=dateFrom(text);return{id:m[1],name,category,size:(text.match(/Velkost\s*([^|]+)/i)||[])[1]?.trim()||'?',seeds:+((text.match(/Odosielaju\s*:\s*(\d+)/i)||[])[1]||0),addedDate:d,added:d?d.toISOString().slice(0,10):null,poster:posterFromCell($,cell),year:yearFrom(name),detailUrl:abs(href),downloadUrl:`${BASE}/torrent/download.php?id=${encodeURIComponent(m[1])}`}}
async function fetchPage(p,c={},category=0,search=''){const key=`page:${category}:${p}:${search}`;return cached(key,TTL,async()=>{const r=await client().get(SEARCH,{params:{active:0,category,order:'data',by:'DESC',page:p,...(search?{search}:{})}}),$=cheerio.load(r.data),map=new Map();$('a[href^="details.php"]').each((_,el)=>{const x=parseAnchor($,el,category);if(!x)return;const old=map.get(x.id);if(!old||x.name.length>old.name.length||(!old.poster&&x.poster))map.set(x.id,{...old,...x})});const out=[...map.values()];log(`SKTorrent page=${p} category=${category} search=${search||'-'} parsed=${out.length}`);return out})}
