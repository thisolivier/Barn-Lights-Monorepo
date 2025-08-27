const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const bin = path.join(__dirname, '..', 'bin', 'lights-sender');
const result = spawnSync('node', [bin], { encoding: 'utf8' });

assert.strictEqual(result.status, 0, `expected exit code 0, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
