
// v2.2.0: opt-in Wako card identity, shared video identity for all stream addons.
require('./wako-mode').install(app);
const wakoModeManifestBase=manifest;
manifest=function(){return {...wakoModeManifestBase(),version:'2.2.0'}};
