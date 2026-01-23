// Tests for the command line interface using Node's built-in test runner.
//
// The test runner discovers any file ending in `.test.js` and executes the
// exported tests. Here we verify that invoking the CLI without arguments
// exits cleanly with status code 0.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('CLI exits with code 0 after SIGINT', async () => {
  const bin = path.join(__dirname, '..', 'bin', 'lights-sender.mjs');
  const configPath = path.join(
    __dirname,
    'fixtures',
    'cli_renderer.config.json',
  );
  const child = spawn('node', [bin, '--config', configPath], {
    stdio: 'pipe',
  });

  await new Promise((resolve) => setTimeout(resolve, 500));
  child.kill('SIGINT');

  const exitCode = await new Promise((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  assert.strictEqual(exitCode, 0);
});

