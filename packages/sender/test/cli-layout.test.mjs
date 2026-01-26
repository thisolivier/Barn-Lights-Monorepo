import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { withTimeout } from './helpers/timeout.mjs';
import { spawnCLI } from './helpers/spawn-with-diagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bin = path.join(__dirname, '..', 'bin', 'lights-sender.mjs');

test('CLI loads valid config and layouts', async () => {
  const configPath = path.join(__dirname, 'fixtures', 'cli_renderer.config.json');
  const { child } = spawnCLI(bin, ['--config', configPath]);
  await new Promise((resolve) => setTimeout(resolve, 500));
  child.kill('SIGINT');
  const exitCode = await withTimeout(
    new Promise((resolve) => child.on('exit', (code) => resolve(code))),
    5000,
    'Process exit timeout'
  );
  assert.strictEqual(exitCode, 0);
});

test('CLI fails when layout is invalid', () => {
  const configPath = path.join(__dirname, 'fixtures', 'cli_bad_layout.config.json');
  const result = spawnSync('node', [bin, '--config', configPath], {
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 1);
});
