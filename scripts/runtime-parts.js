'use strict';

// Keep this order: later compatibility layers build on earlier definitions.
// Part35 is intentionally excluded; it caused overly broad concert matches.
const RUNTIME_PARTS = Object.freeze([
  ...Array.from({ length: 34 }, (_, i) => `server-v4.part${i + 1}.js`),
  'server-v4.part36.js'
]);
module.exports = { RUNTIME_PARTS };
