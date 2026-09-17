'use strict';
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');
const packed = fs.readFileSync(path.join(__dirname, 'scjc-server.js.gz.b64'), 'utf8').trim();
const source = zlib.gunzipSync(Buffer.from(packed, 'base64')).toString('utf8');
const run = new Function('require', 'module', 'exports', '__filename', '__dirname', source);
run(require, module, exports, path.join(__dirname, 'server.js'), __dirname);
