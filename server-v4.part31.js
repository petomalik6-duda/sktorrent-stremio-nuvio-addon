
// v2.2.8: restore the last-known-good Wako presentation contract from v2.2.2.
// Keep the current SKTorrent backend, but remove later Wako-only catalog remapping
// and P2P metadata overrides that coincided with Wako hiding valid streams.
require('./wako-mode').install(app);
const wakoModeManifestBase=manifest;
manifest=function(){return {...wakoModeManifestBase(),version:'2.2.8'}};
