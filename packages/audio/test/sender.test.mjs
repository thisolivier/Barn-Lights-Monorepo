/**
 * Tests for the AudioSender class in sender.ts
 *
 * Tests cover:
 * - Message format correctness
 * - Rate limiting (60Hz)
 * - Connection state management
 * - Graceful shutdown
 *
 * Note: Some reconnection tests are intentionally simplified to avoid
 * flaky timing-dependent behavior in CI environments.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import { withTimeout } from './helpers/timeout.mjs';

// Import from compiled output
import { AudioSender } from '../dist/sender.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock WebSocket server for testing.
 * @param {number} [port=0] - Port to listen on (0 = auto-assign)
 * @returns {Promise<{server: WebSocketServer, port: number, messages: Array, close: Function}>}
 */
async function createMockServer(port = 0) {
  const messages = [];
  const server = new WebSocketServer({ port });

  await withTimeout(
    new Promise((resolve) => server.on('listening', resolve)),
    5000,
    'Server start timeout'
  );

  const actualPort = server.address().port;

  server.on('connection', (ws) => {
    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        messages.push(data.toString());
      }
    });
  });

  return {
    server,
    port: actualPort,
    messages,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/**
 * Create mock audio features for testing.
 * @param {Partial<AudioFeatures>} [overrides={}]
 * @returns {AudioFeatures}
 */
function createMockFeatures(overrides = {}) {
  return {
    rms: 0.5,
    bass: 0.3,
    mids: 0.4,
    highs: 0.2,
    beat: false,
    ...overrides,
  };
}

/**
 * Wait for a condition to become true.
 * @param {Function} condition - Function returning boolean
 * @param {number} timeout - Maximum time to wait in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise<void>}
 */
async function waitFor(condition, timeout = 2000, interval = 10) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Wait condition timed out');
}

// ============================================================================
// Message Format Tests
// ============================================================================

test('message format includes type and all feature fields', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
    sendRate: 60,
  });

  try {
    sender.connect();
    await waitFor(() => sender.connected);

    const features = createMockFeatures({
      rms: 0.75,
      bass: 0.5,
      mids: 0.3,
      highs: 0.1,
      beat: true,
    });
    sender.send(features);

    await waitFor(() => mock.messages.length > 0);

    const message = mock.messages[0];
    assert.equal(message.type, 'audio', 'Message type should be "audio"');
    assert.equal(message.rms, 0.75, 'RMS should match');
    assert.equal(message.bass, 0.5, 'Bass should match');
    assert.equal(message.mids, 0.3, 'Mids should match');
    assert.equal(message.highs, 0.1, 'Highs should match');
    assert.equal(message.beat, true, 'Beat should match');
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

test('message values are serialized as JSON', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
    sendRate: 60,
  });

  try {
    sender.connect();
    await waitFor(() => sender.connected);

    sender.send(createMockFeatures());
    await waitFor(() => mock.messages.length > 0);

    assert.equal(typeof mock.messages[0], 'object', 'Message should be parsed as object');
    assert.ok('type' in mock.messages[0], 'Message should have type property');
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

// ============================================================================
// Rate Limiting Tests
// ============================================================================

test('rate limiting restricts message frequency', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
    sendRate: 20,  // 20Hz = 50ms intervals
  });

  try {
    sender.connect();
    await waitFor(() => sender.connected);

    // Rapidly send many features
    for (let i = 0; i < 100; i++) {
      sender.send(createMockFeatures({ rms: i / 100 }));
    }

    // Wait 300ms - should get about 6 messages at 20Hz
    await new Promise((resolve) => setTimeout(resolve, 300));

    // At 20Hz, in 300ms we expect roughly 6 messages (not 100)
    // Allow wider tolerance for CI timing variance
    assert.ok(
      mock.messages.length >= 1 && mock.messages.length <= 10,
      `Expected 1-10 messages at 20Hz in 300ms, got ${mock.messages.length}`
    );
    // Key assertion: we should have far fewer messages than sent
    assert.ok(
      mock.messages.length < 50,
      `Rate limiting should reduce messages significantly, got ${mock.messages.length}`
    );
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

test('no messages sent when disconnected', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
    sendRate: 60,
  });

  try {
    // Don't connect - just send features
    sender.send(createMockFeatures());

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(mock.messages.length, 0, 'No messages should be sent when disconnected');
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

// ============================================================================
// Connection State Tests
// ============================================================================

test('connected property reflects connection state', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
  });

  try {
    assert.equal(sender.connected, false, 'Should be disconnected initially');

    sender.connect();
    await waitFor(() => sender.connected);
    assert.equal(sender.connected, true, 'Should be connected after connect()');

    sender.disconnect();
    assert.equal(sender.connected, false, 'Should be disconnected after disconnect()');
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

test('multiple connect calls are idempotent', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
  });

  try {
    sender.connect();
    sender.connect();
    sender.connect();

    await waitFor(() => sender.connected);
    assert.equal(sender.connected, true, 'Should be connected');
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

// ============================================================================
// Graceful Shutdown Tests
// ============================================================================

test('disconnect closes WebSocket cleanly', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  let clientClosed = false;

  mock.server.on('connection', (ws) => {
    ws.on('close', () => {
      clientClosed = true;
    });
  });

  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
  });

  try {
    sender.connect();
    await waitFor(() => sender.connected);

    sender.disconnect();

    await waitFor(() => clientClosed);
    assert.ok(clientClosed, 'Server should receive close event');
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

test('disconnect can be called multiple times safely', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
  });

  try {
    sender.connect();
    await waitFor(() => sender.connected);

    // Multiple disconnects should not throw
    sender.disconnect();
    sender.disconnect();
    sender.disconnect();

    assert.equal(sender.connected, false, 'Should remain disconnected');
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

test('disconnect before connect is safe', () => {
  const sender = new AudioSender({
    url: 'ws://localhost:8080',
  });

  // Should not throw
  sender.disconnect();
  sender.disconnect();

  assert.equal(sender.connected, false, 'Should be disconnected');
});

test('send loop stops on disconnect', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://localhost:${mock.port}`,
    sendRate: 60,
  });

  try {
    sender.connect();
    await waitFor(() => sender.connected);

    sender.send(createMockFeatures());
    await new Promise((resolve) => setTimeout(resolve, 50));
    const countBeforeDisconnect = mock.messages.length;

    sender.disconnect();

    // Continue trying to send
    for (let i = 0; i < 10; i++) {
      sender.send(createMockFeatures());
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.equal(
      mock.messages.length,
      countBeforeDisconnect,
      'No messages should be sent after disconnect'
    );
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

// ============================================================================
// Configuration Tests
// ============================================================================

test('custom URL is used for connection', { timeout: 10000 }, async () => {
  const mock = await createMockServer();
  const sender = new AudioSender({
    url: `ws://127.0.0.1:${mock.port}`,
  });

  try {
    sender.connect();
    await waitFor(() => sender.connected);
    assert.ok(sender.connected, 'Should connect to custom URL');
  } finally {
    sender.disconnect();
    await mock.close();
  }
});

test('default configuration creates valid sender', () => {
  const sender = new AudioSender();
  assert.equal(sender.connected, false, 'Should start disconnected');
});
