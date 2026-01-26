// Tests for the command line interface using Node's built-in test runner.
//
// The test runner discovers any file ending in `.test.js` and executes the
// exported tests. Here we verify that invoking the CLI without arguments
// exits cleanly with status code 0.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { withTimeout } from './helpers/timeout.mjs';
import { spawnCLI } from './helpers/spawn-with-diagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('CLI exits with code 0 after SIGINT', async () => {
  const bin = path.join(__dirname, '..', 'bin', 'lights-sender.mjs');
  const configPath = path.join(
    __dirname,
    'fixtures',
    'cli_renderer.config.json',
  );
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

