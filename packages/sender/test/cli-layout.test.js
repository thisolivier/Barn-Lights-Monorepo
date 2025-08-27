const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { main } = require('../src/cli');

const run = (args) => main(['node', 'lights-sender', ...args]);

test('main loads valid config and layouts', async () => {
  const configPath = path.join(__dirname, '..', 'config', 'sender.config.json');
  const code = await run(['--config', configPath]);
  assert.strictEqual(code, 0);
});

test('main fails when layout is invalid', async () => {
  const configPath = path.join(__dirname, 'fixtures', 'cli_bad_layout.config.json');
  const code = await run(['--config', configPath]);
  assert.strictEqual(code, 1);
});
