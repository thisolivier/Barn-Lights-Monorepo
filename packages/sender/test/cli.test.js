// Tests for the command line interface using Node's built-in test runner.
//
// The test runner discovers any file ending in `.test.js` and executes the
// exported tests. Here we verify that invoking the CLI without arguments
// exits cleanly with status code 0.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');

test('CLI exits with code 0', () => {
  // Resolve the path to the CLI entry point relative to this test file.
  const bin = path.join(__dirname, '..', 'bin', 'lights-sender');
  // Run the CLI synchronously so the test waits for it to finish.
  const result = spawnSync('node', [bin], { encoding: 'utf8' });
  // Assert that the process exited successfully. Include stdout/stderr in
  // the message to help debug failures.
  assert.strictEqual(
    result.status,
    0,
    `expected exit code 0, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
  );
});

