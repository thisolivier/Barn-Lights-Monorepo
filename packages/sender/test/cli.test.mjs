// Tests for the command line interface using Node's built-in test runner.
//
// The test runner discovers any file ending in `.test.js` and executes the
// exported tests. Here we verify that invoking the CLI without arguments
// exits cleanly with status code 0.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('CLI exits with code 0', () => {
  // Resolve the path to the CLI entry point relative to this test file.
  const bin = path.join(__dirname, '..', 'bin', 'lights-sender.mjs');
  const configPath = path.join(__dirname, 'fixtures', 'cli_renderer.config.json');
  // Run the CLI synchronously so the test waits for it to finish.
  const result = spawnSync('node', [bin, '--config', configPath], { encoding: 'utf8' });
  // Assert that the process exited successfully. Include stdout/stderr in
  // the message to help debug failures.
  assert.strictEqual(
    result.status,
    0,
    `expected exit code 0, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

