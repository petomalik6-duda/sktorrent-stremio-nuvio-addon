"use strict";
const net = require('node:net');
// Operator-owned registry only. Never consume URLs from addon tokens or requests.
function parseRegistry(raw = '{}') {
  if (raw.length > 262144) throw Error('DIRECT_STREAMS_JSON is too large');
  let entries;
  try { entries = JSON.parse(raw); } catch { throw Error('Invalid DIRECT_STREAMS_JSON'); }
  if (!entries || Array.isArray(entries) || typeof entries !== 'object') throw Error('Invalid direct stream registry');
  const registry = new Map();
  for (const [key, value] of Object.entries(entries)) {
    if (!/^[a-f0-9]{40}:(0|[1-9][0-9]*)$/.test(key) || !Number.isSafeInteger(Number(key.split(':')[1]))) throw Error('Invalid direct stream key');
    if (typeof value !== 'string' || value.length > 8192) throw Error('Invalid direct stream URL');
    let url;
    try { url = new URL(value); } catch { throw Error('Invalid direct stream URL'); }
    const host = url.hostname.toLowerCase();
    // No credentials, IP literals, local hosts, tracker download pages, or magnets.
    if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
        net.isIP(host) || host.includes(':') || !host.includes('.') ||
        /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) ||
        /\.(torrent)(?:$|\/)|\/(?:download|details)\.php$/i.test(url.pathname)) throw Error('Unsafe direct stream URL');
    registry.set(key, url.href);
  }
  return registry;
}
function addDirectStreams(streams, registry) {
  if (!Array.isArray(streams)) return streams;
  const direct = [], seen = new Set();
  for (const source of streams) {
    if (!source || !/^[a-f0-9]{40}$/i.test(source.infoHash || '') || !Number.isSafeInteger(source.fileIdx) || source.fileIdx < 0) continue;
    const key = `${source.infoHash.toLowerCase()}:${source.fileIdx}`, url = registry.get(key);
    if (!url || seen.has(key)) continue;
    seen.add(key);
    const hints = source.behaviorHints || {};
    direct.push({name: `${source.name || 'SKTorrent'} • HTTPS`, title: source.title,
      url, behaviorHints: {filename: hints.filename, bingeGroup: hints.bingeGroup,
        notWebReady: !/\.mp4$/i.test(new URL(url).pathname)}});
  }
  // Keep the original objects, order and fields intact for existing clients.
  return [...direct, ...streams];
}
module.exports = {parseRegistry, addDirectStreams};
