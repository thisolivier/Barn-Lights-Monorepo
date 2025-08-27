import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { main } from '../src/cli.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const run = (args) => main(['node', 'lights-sender', ...args]);

test('main loads valid config and layouts', async () => {
  const configPath = path.join(__dirname, 'fixtures', 'cli_renderer.config.json');
  const code = await run(['--config', configPath]);
  assert.strictEqual(code, 0);
});

test('main fails when layout is invalid', async () => {
  const configPath = path.join(__dirname, 'fixtures', 'cli_bad_layout.config.json');
  const code = await run(['--config', configPath]);
  assert.strictEqual(code, 1);
});
