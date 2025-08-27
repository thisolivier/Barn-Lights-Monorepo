// Tests for the renderer process module using Node's built-in test runner.
//
// These tests simulate renderer behaviors using small fixture scripts. The
// fixtures are executed via `process.execPath` (Node itself), which keeps
// the test environment simple and portable.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { RendererProcess } = require('../src/renderer-process');

test('ingests NDJSON lines and logs errors', async () => {
  const logs = [];
  // Logger stub records error messages so we can make assertions later.
  const logger = { error: (msg) => logs.push(msg), warn() {}, info() {}, debug() {} };
  const runtimeConfig = {
    renderer: {
      // Use Node to run the fixture that emits a mix of good and bad lines.
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_stream.js')],
    },
  };
  const rp = new RendererProcess(runtimeConfig, logger);
  const frames = [];
  rp.on('FrameIngest', (frame) => frames.push(frame));

  // Start the renderer and wait for it to exit so all lines are processed.
  const child = rp.start();
  await new Promise((resolve) => child.on('close', resolve));

  // Verify that only the valid frame was ingested.
  assert.strictEqual(frames.length, 1, `expected 1 frame, got ${frames.length}`);
  assert.strictEqual(frames[0].frame, 1);
  // Ensure error messages were logged for the malformed and unsupported lines.
  assert(logs.some((l) => l.includes('Failed to parse NDJSON line')));
  assert(logs.some((l) => l.includes('Unsupported format')));
});

test('emits error when renderer crashes', async () => {
  const runtimeConfig = {
    renderer: {
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_crash.js')],
    },
  };
  const rp = new RendererProcess(runtimeConfig, console);

  // The error event should fire with an Error instance when the renderer exits
  // with a nonzero status code.
  const err = await new Promise((resolve) => {
    rp.on('error', resolve);
    rp.start();
  });
  assert(err instanceof Error);
});

