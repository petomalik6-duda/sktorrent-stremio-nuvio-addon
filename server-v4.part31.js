
// v2.2.1: opt-in Wako card identity plus shared IMDb/TMDB video identity for paired concerts and movies.
require('./wako-mode').install(app);
const wakoModeManifestBase=manifest;
manifest=function(){return {...wakoModeManifestBase(),version:'2.2.1'}};
