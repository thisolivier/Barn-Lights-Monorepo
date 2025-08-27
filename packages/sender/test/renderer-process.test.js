const assert = require('assert');
const path = require('path');
const { RendererProcess } = require('../src/renderer-process');

// This test spins up a fake renderer that writes a mix of good and
// bad NDJSON lines. We verify that the good frame is ingested and that
// errors were logged for the bad ones.
async function testIngestAndErrors() {
  const logs = [];
  // Simple logger implementation that records error messages so we can
  // make assertions about what happened.
  const logger = { error: (msg) => logs.push(msg), warn() {}, info() {}, debug() {} };
  const runtimeConfig = {
    renderer: {
      // Use Node itself to execute our small fixture script.
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_stream.js')],
    },
  };
  const rp = new RendererProcess(runtimeConfig, logger);
  const frames = [];
  rp.on('FrameIngest', (frame) => frames.push(frame));
  const child = rp.start();
  // Wait for the fixture process to finish writing its lines.
  await new Promise((resolve) => child.on('close', resolve));
  assert.strictEqual(frames.length, 1, `expected 1 frame, got ${frames.length}`);
  assert.strictEqual(frames[0].frame, 1);
  // Ensure our logger caught parse and format errors.
  assert(logs.some((l) => l.includes('Failed to parse NDJSON line')));
  assert(logs.some((l) => l.includes('Unsupported format')));
}

// This test uses a renderer that exits immediately with a nonzero code.
// The RendererProcess should surface this as an error event.
async function testCrashEmitsError() {
  const runtimeConfig = {
    renderer: {
      cmd: process.execPath,
      args: [path.join(__dirname, 'fixtures', 'renderer_crash.js')],
    },
  };
  const rp = new RendererProcess(runtimeConfig, console);
  const err = await new Promise((resolve) => {
    rp.on('error', resolve);
    rp.start();
  });
  assert(err instanceof Error);
}

(async () => {
  await testIngestAndErrors();
  await testCrashEmitsError();
})();
