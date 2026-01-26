// Tests for the renderer process module using Node's built-in test runner.
//
// These tests simulate renderer behaviors using small fixture scripts. The
// fixtures are executed via `process.execPath` (Node itself), which keeps
// the test environment simple and portable.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { RendererProcess } from '../src/renderer-process/index.mjs';
import { withTimeout } from './helpers/timeout.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('ingests NDJSON lines and logs errors', { timeout: 10000 }, async () => {
  const logs = [];
  // Logger stub records error messages so we can make assertions later.
  const logger = { error: (msg) => logs.push(msg), warn() {}, info() {}, debug() {} };
  const runtimeConfig = {
    renderer: {
      // Use Node to run the fixture that emits a mix of good and bad lines.
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_stream.mjs')],
    },
  };
  const rp = new RendererProcess(runtimeConfig, logger);
  const frames = [];
  rp.on('FrameIngest', (frame) => frames.push(frame));

  // Start the renderer and wait for it to exit so all lines are processed.
  const child = rp.start();
  await withTimeout(
    new Promise((resolve) => child.on('close', resolve)),
    5000,
    'Process close timeout'
  );

  // Verify that only the valid frame was ingested.
  assert.strictEqual(frames.length, 1, `expected 1 frame, got ${frames.length}`);
  assert.strictEqual(frames[0].frame, 1);
  // Ensure error messages were logged for the malformed and unsupported lines.
  assert(logs.some((l) => l.includes('Failed to parse NDJSON line')));
  assert(logs.some((l) => l.includes('Unsupported format')));
});

test('ignores output until the first timestamped frame', { timeout: 10000 }, async () => {
  const logs = [];
  const logger = { error: (msg) => logs.push(msg), warn() {}, info() {}, debug() {} };
  const runtimeConfig = {
    renderer: {
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_preamble.mjs')],
    },
  };
  const rendererProcess = new RendererProcess(runtimeConfig, logger);
  const frames = [];
  rendererProcess.on('FrameIngest', (frame) => frames.push(frame));

  const child = rendererProcess.start();
  await withTimeout(
    new Promise((resolve) => child.on('close', resolve)),
    5000,
    'Process close timeout'
  );

  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].frame, 1);
  assert.strictEqual(logs.length, 0);
});

test('emits error when renderer crashes', { timeout: 10000 }, async () => {
  const runtimeConfig = {
    renderer: {
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_crash.mjs')],
    },
  };
  const rp = new RendererProcess(runtimeConfig, console);

  // The error event should fire with an Error instance when the renderer exits
  // with a nonzero status code.
  const err = await withTimeout(
    new Promise((resolve) => {
      rp.on('error', resolve);
      rp.start();
    }),
    5000,
    'Error event timeout'
  );
  assert(err instanceof Error);
});

test('emits reboot events for special frames', { timeout: 10000 }, async () => {
  const runtimeConfig = {
    renderer: {
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_reboot.mjs')],
    },
  };
  const logs = [];
  const logger = { error: (msg) => logs.push(msg), warn() {}, info() {}, debug() {} };
  const rp = new RendererProcess(runtimeConfig, logger);
  const receivedSides = [];
  rp.on('Reboot', (sideName) => receivedSides.push(sideName));
  const child = rp.start();
  await withTimeout(
    new Promise((resolve) => child.on('close', resolve)),
    5000,
    'Process close timeout'
  );
  assert.deepEqual(receivedSides, ['left']);
  assert.strictEqual(logs.length, 0);
});

