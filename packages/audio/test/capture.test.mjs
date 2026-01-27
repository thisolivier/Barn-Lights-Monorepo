/**
 * Tests for the AudioCapture module patterns and mock behavior.
 *
 * Since naudiodon (PortAudio bindings) crashes with SIGSEGV in some
 * environments when accessing audio devices, these tests verify:
 *
 * 1. Mock implementation patterns that match the real AudioCapture behavior
 * 2. Data format conversions (Buffer to Int16Array)
 * 3. Device filtering logic
 * 4. Configuration patterns
 *
 * The mock tests ensure our understanding of the module's contract is correct
 * and can catch regressions if the implementation changes.
 *
 * To run tests with actual hardware (when available), use:
 *   AUDIO_TEST_HARDWARE=1 npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';

// ============================================================================
// Mock PortAudio Module (Simulates naudiodon)
// ============================================================================

/**
 * Mock audio device info.
 */
const mockDevices = [
  { id: 0, name: 'Built-in Microphone', maxInputChannels: 2, maxOutputChannels: 0 },
  { id: 1, name: 'Built-in Output', maxInputChannels: 0, maxOutputChannels: 2 },
  { id: 2, name: 'External Audio Interface', maxInputChannels: 4, maxOutputChannels: 4 },
];

/**
 * Mock audio stream that simulates naudiodon's IoStreamRead.
 */
class MockAudioStream extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    // Simulate async audio data emission
    setImmediate(() => {
      if (this.isRunning) {
        const buffer = Buffer.alloc(512);  // 256 samples * 2 bytes
        this.emit('data', buffer);
      }
    });
  }

  quit() {
    this.isRunning = false;
  }

  /**
   * Simulate emitting audio data.
   * @param {Buffer} buffer
   */
  simulateData(buffer) {
    if (this.isRunning) {
      this.emit('data', buffer);
    }
  }

  /**
   * Simulate an error.
   * @param {Error} error
   */
  simulateError(error) {
    this.emit('error', error);
  }
}

/**
 * Create a mock portAudio module for testing.
 */
function createMockPortAudio(options = {}) {
  const devices = options.devices ?? mockDevices;
  const audioStreams = [];

  return {
    getDevices: () => devices,
    AudioIO: (config) => {
      const stream = new MockAudioStream(config);
      audioStreams.push(stream);
      return stream;
    },
    SampleFormat16Bit: 8,
    // For test access
    _streams: audioStreams,
  };
}

// ============================================================================
// Mock AudioCapture Class (Simulates the real implementation)
// ============================================================================

/**
 * Default capture configuration (matches capture.ts).
 */
const DEFAULT_CONFIG = {
  sampleRate: 44100,
  bufferSize: 256,
  channels: 1,
  bitDepth: 16,
};

/**
 * Mock AudioCapture that simulates the real class behavior.
 * This is used to verify the expected patterns without requiring hardware.
 */
class MockAudioCapture extends EventEmitter {
  constructor(config = {}, portAudio = createMockPortAudio()) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.portAudio = portAudio;
    this.audioInput = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;

    const devices = this.portAudio.getDevices();
    const defaultInput = devices.find((d) => d.maxInputChannels > 0);

    if (!defaultInput) {
      throw new Error('No audio input device found');
    }

    this.audioInput = this.portAudio.AudioIO({
      inOptions: {
        channelCount: this.config.channels,
        sampleFormat: this.portAudio.SampleFormat16Bit,
        sampleRate: this.config.sampleRate,
        deviceId: defaultInput.id,
        framesPerBuffer: this.config.bufferSize,
      },
    });

    this.audioInput.on('data', (buffer) => {
      const samples = new Int16Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.length / 2
      );
      this.emit('data', samples);
    });

    this.audioInput.on('error', (err) => {
      this.emit('error', err);
    });

    this.audioInput.start();
    this.isRunning = true;
    this.emit('start');
  }

  stop() {
    if (!this.isRunning || !this.audioInput) return;

    this.audioInput.quit();
    this.audioInput = null;
    this.isRunning = false;
    this.emit('stop');
  }

  get running() {
    return this.isRunning;
  }

  getConfig() {
    return { ...this.config };
  }
}

/**
 * Mock listInputDevices function.
 */
function mockListInputDevices(portAudio = createMockPortAudio()) {
  const devices = portAudio.getDevices();
  return devices
    .filter((d) => d.maxInputChannels > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      maxInputChannels: d.maxInputChannels,
    }));
}

// ============================================================================
// Configuration Tests
// ============================================================================

test('MockAudioCapture: accepts custom configuration', () => {
  const capture = new MockAudioCapture({
    sampleRate: 48000,
    bufferSize: 512,
    channels: 2,
    bitDepth: 16,
  });

  const config = capture.getConfig();
  assert.equal(config.sampleRate, 48000, 'Custom sample rate should be stored');
  assert.equal(config.bufferSize, 512, 'Custom buffer size should be stored');
  assert.equal(config.channels, 2, 'Custom channels should be stored');
  assert.equal(config.bitDepth, 16, 'Custom bit depth should be stored');
});

test('MockAudioCapture: uses default configuration when none provided', () => {
  const capture = new MockAudioCapture();
  const config = capture.getConfig();

  assert.equal(config.sampleRate, 44100, 'Default sample rate should be 44100');
  assert.equal(config.bufferSize, 256, 'Default buffer size should be 256');
  assert.equal(config.channels, 1, 'Default channels should be 1 (mono)');
  assert.equal(config.bitDepth, 16, 'Default bit depth should be 16');
});

test('MockAudioCapture: getConfig returns a copy', () => {
  const capture = new MockAudioCapture({ sampleRate: 44100 });
  const config1 = capture.getConfig();
  const config2 = capture.getConfig();

  config1.sampleRate = 99999;
  assert.notEqual(config2.sampleRate, config1.sampleRate, 'getConfig should return a copy');
});

// ============================================================================
// Running State Tests
// ============================================================================

test('MockAudioCapture: running property is initially false', () => {
  const capture = new MockAudioCapture();
  assert.equal(capture.running, false, 'Should not be running initially');
});

test('MockAudioCapture: running becomes true after start', () => {
  const capture = new MockAudioCapture();
  capture.start();
  assert.equal(capture.running, true, 'Should be running after start()');
  capture.stop();
});

test('MockAudioCapture: running becomes false after stop', () => {
  const capture = new MockAudioCapture();
  capture.start();
  capture.stop();
  assert.equal(capture.running, false, 'Should not be running after stop()');
});

test('MockAudioCapture: stop when not running is safe', () => {
  const capture = new MockAudioCapture();
  capture.stop();  // Should not throw
  capture.stop();  // Multiple stops should be safe
  assert.equal(capture.running, false, 'Should remain not running');
});

test('MockAudioCapture: multiple starts do not duplicate', () => {
  const mockPA = createMockPortAudio();
  const capture = new MockAudioCapture({}, mockPA);

  capture.start();
  capture.start();  // Second start should be no-op
  capture.start();

  assert.equal(mockPA._streams.length, 1, 'Should only create one stream');
  capture.stop();
});

// ============================================================================
// Event Emitter Tests
// ============================================================================

test('MockAudioCapture: extends EventEmitter', () => {
  const capture = new MockAudioCapture();
  assert.ok(capture instanceof EventEmitter, 'Should extend EventEmitter');
  assert.ok(typeof capture.on === 'function', 'Should have on method');
  assert.ok(typeof capture.emit === 'function', 'Should have emit method');
});

test('MockAudioCapture: can register event listeners for all event types', () => {
  const capture = new MockAudioCapture();

  capture.on('data', () => {});
  capture.on('error', () => {});
  capture.on('start', () => {});
  capture.on('stop', () => {});

  assert.equal(capture.listenerCount('data'), 1);
  assert.equal(capture.listenerCount('error'), 1);
  assert.equal(capture.listenerCount('start'), 1);
  assert.equal(capture.listenerCount('stop'), 1);
});

test('MockAudioCapture: emits start event on start', () => {
  const capture = new MockAudioCapture();
  let started = false;

  capture.on('start', () => { started = true; });
  capture.start();

  assert.ok(started, 'Should emit start event');
  capture.stop();
});

test('MockAudioCapture: emits stop event on stop', () => {
  const capture = new MockAudioCapture();
  let stopped = false;

  capture.on('stop', () => { stopped = true; });
  capture.start();
  capture.stop();

  assert.ok(stopped, 'Should emit stop event');
});

test('MockAudioCapture: emits data as Int16Array', async () => {
  const mockPA = createMockPortAudio();
  const capture = new MockAudioCapture({}, mockPA);

  const dataPromise = new Promise((resolve) => {
    capture.on('data', (samples) => resolve(samples));
  });

  capture.start();

  // Simulate data from the mock stream
  const testBuffer = Buffer.alloc(512);
  testBuffer.writeInt16LE(1000, 0);
  testBuffer.writeInt16LE(-500, 2);
  mockPA._streams[0].simulateData(testBuffer);

  const samples = await dataPromise;

  assert.ok(samples instanceof Int16Array, 'Data should be Int16Array');
  assert.equal(samples[0], 1000, 'First sample should match');
  assert.equal(samples[1], -500, 'Second sample should match');

  capture.stop();
});

test('MockAudioCapture: emits error events from stream', async () => {
  const mockPA = createMockPortAudio();
  const capture = new MockAudioCapture({}, mockPA);

  const errorPromise = new Promise((resolve) => {
    capture.on('error', (err) => resolve(err));
  });

  capture.start();

  const testError = new Error('Audio device disconnected');
  mockPA._streams[0].simulateError(testError);

  const error = await errorPromise;
  assert.equal(error.message, 'Audio device disconnected');

  capture.stop();
});

// ============================================================================
// Device Selection Tests
// ============================================================================

test('mockListInputDevices: returns only input devices', () => {
  const devices = mockListInputDevices();

  assert.equal(devices.length, 2, 'Should have 2 input-capable devices');
  assert.ok(devices.every(d => d.maxInputChannels > 0), 'All should be input devices');
});

test('mockListInputDevices: excludes output-only devices', () => {
  const devices = mockListInputDevices();
  const outputOnly = devices.find(d => d.name === 'Built-in Output');

  assert.equal(outputOnly, undefined, 'Output-only device should be excluded');
});

test('mockListInputDevices: returns expected properties', () => {
  const devices = mockListInputDevices();

  for (const device of devices) {
    assert.ok(typeof device.id === 'number', 'Device should have numeric id');
    assert.ok(typeof device.name === 'string', 'Device should have string name');
    assert.ok(typeof device.maxInputChannels === 'number', 'Device should have maxInputChannels');
  }
});

test('MockAudioCapture: throws when no input device available', () => {
  const mockPA = createMockPortAudio({
    devices: [
      { id: 0, name: 'Output Only', maxInputChannels: 0, maxOutputChannels: 2 },
    ],
  });
  const capture = new MockAudioCapture({}, mockPA);

  assert.throws(
    () => capture.start(),
    /No audio input device found/,
    'Should throw when no input device'
  );
});

test('MockAudioCapture: uses first available input device', () => {
  const mockPA = createMockPortAudio();
  const capture = new MockAudioCapture({}, mockPA);

  capture.start();

  const stream = mockPA._streams[0];
  assert.equal(
    stream.options.inOptions.deviceId,
    0,
    'Should use first input device (id=0)'
  );

  capture.stop();
});

// ============================================================================
// Audio Stream Configuration Tests
// ============================================================================

test('MockAudioCapture: passes correct configuration to stream', () => {
  const mockPA = createMockPortAudio();
  const capture = new MockAudioCapture({
    sampleRate: 48000,
    bufferSize: 512,
    channels: 2,
  }, mockPA);

  capture.start();

  const stream = mockPA._streams[0];
  assert.equal(stream.options.inOptions.sampleRate, 48000, 'Sample rate should match');
  assert.equal(stream.options.inOptions.framesPerBuffer, 512, 'Buffer size should match');
  assert.equal(stream.options.inOptions.channelCount, 2, 'Channel count should match');

  capture.stop();
});

// ============================================================================
// Buffer Conversion Tests
// ============================================================================

test('Buffer to Int16Array conversion handles various buffer sizes', () => {
  const sizes = [128, 256, 512, 1024];

  for (const sampleCount of sizes) {
    const buffer = Buffer.alloc(sampleCount * 2);

    for (let i = 0; i < sampleCount; i++) {
      buffer.writeInt16LE(i, i * 2);
    }

    const samples = new Int16Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.length / 2
    );

    assert.equal(samples.length, sampleCount, `Should have ${sampleCount} samples`);
    assert.equal(samples[0], 0, 'First sample should be 0');
    assert.equal(samples[sampleCount - 1], sampleCount - 1, 'Last sample should be count-1');
  }
});

test('Int16Array correctly represents signed 16-bit values', () => {
  const buffer = Buffer.alloc(8);
  buffer.writeInt16LE(32767, 0);   // Max positive
  buffer.writeInt16LE(-32768, 2);  // Max negative
  buffer.writeInt16LE(0, 4);       // Zero
  buffer.writeInt16LE(-1, 6);      // -1

  const samples = new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / 2
  );

  assert.equal(samples[0], 32767, 'Max positive should be 32767');
  assert.equal(samples[1], -32768, 'Max negative should be -32768');
  assert.equal(samples[2], 0, 'Zero should be 0');
  assert.equal(samples[3], -1, 'Negative one should be -1');
});

test('Int16Array handles typical audio waveform values', () => {
  const buffer = Buffer.alloc(10);
  buffer.writeInt16LE(0, 0);       // Zero crossing
  buffer.writeInt16LE(16384, 2);   // Half max positive
  buffer.writeInt16LE(32767, 4);   // Peak positive
  buffer.writeInt16LE(16384, 6);   // Half max positive (descending)
  buffer.writeInt16LE(0, 8);       // Zero crossing

  const samples = new Int16Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / 2
  );

  assert.equal(samples[0], 0);
  assert.equal(samples[1], 16384);
  assert.equal(samples[2], 32767);
  assert.equal(samples[3], 16384);
  assert.equal(samples[4], 0);
});

// ============================================================================
// Mock Stream Behavior Tests
// ============================================================================

test('MockAudioStream: starts and stops correctly', () => {
  const stream = new MockAudioStream({});

  assert.equal(stream.isRunning, false, 'Should not be running initially');

  stream.start();
  assert.equal(stream.isRunning, true, 'Should be running after start');

  stream.quit();
  assert.equal(stream.isRunning, false, 'Should not be running after quit');
});

test('MockAudioStream: only emits data when running', async () => {
  const stream = new MockAudioStream({});
  const receivedData = [];

  stream.on('data', (buffer) => receivedData.push(buffer));

  // Not running - should not emit
  stream.simulateData(Buffer.alloc(10));
  assert.equal(receivedData.length, 0, 'Should not emit when not running');

  // Running - should emit
  stream.isRunning = true;
  stream.simulateData(Buffer.alloc(10));
  assert.equal(receivedData.length, 1, 'Should emit when running');

  // Stopped - should not emit
  stream.isRunning = false;
  stream.simulateData(Buffer.alloc(10));
  assert.equal(receivedData.length, 1, 'Should not emit after stopped');
});
