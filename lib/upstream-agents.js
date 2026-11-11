'use strict';
const http = require('node:http');
const https = require('node:https');
// Reuse upstream connections with the same socket limits as the existing runtime.
module.exports = {
  httpAgent: new http.Agent({ keepAlive: true, maxSockets: 40 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 40 })
};
