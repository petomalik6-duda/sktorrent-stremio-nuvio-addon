'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { RUNTIME_PARTS } = require('./runtime-parts');

const root = path.join(__dirname, '..');
const output = path.join(root, 'server-v4.generated.js');
const temporary = path.join(root, `server-v4.generated.${process.pid}.tmp.js`);
try {
  const source = RUNTIME_PARTS.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('');
  fs.writeFileSync(temporary, source);
  const check = spawnSync(process.execPath, ['--check', temporary], { stdio: 'inherit' });
  if (check.error) throw check.error;
  if (check.status !== 0) throw new Error('Generated runtime failed syntax validation');
  fs.renameSync(temporary, output);
  console.log(`Validated runtime: ${RUNTIME_PARTS.length} parts`);
} finally {
  fs.rmSync(temporary, { force: true });
}
