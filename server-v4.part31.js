
// v2.2.2: opt-in Wako movie contract without episode-style videos[] for concerts.
require('./wako-mode').install(app);
const wakoModeManifestBase=manifest;
manifest=function(){return {...wakoModeManifestBase(),version:'2.2.2'}};
