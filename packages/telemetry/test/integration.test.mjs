import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import dgram from 'node:dgram';
import http from 'node:http';
import { createUdpReceiver } from '../src/udp-receiver.mjs';
import { createLogBuffer } from '../src/log-buffer.mjs';
import { createAggregator } from '../src/aggregator.mjs';
import { createServer } from '../src/server.mjs';

/**
 * Helper to make HTTP GET requests
 * @param {string} url - Full URL to request
 * @returns {Promise<{status: number, headers: object, body: string}>}
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });
    req.on('error', reject);
  });
}

/**
 * Helper to parse JSON response
 * @param {object} response
 * @returns {object}
 */
function parseJson(response) {
  return JSON.parse(response.body);
}

/**
 * Helper to send UDP message
 * @param {number} port - Target port
 * @param {object} data - Data to send (will be JSON stringified)
 * @returns {Promise<void>}
 */
function sendUdp(port, data) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    const message = Buffer.from(JSON.stringify(data));

    socket.send(message, 0, message.length, port, '127.0.0.1', (err) => {
      socket.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Helper to wait for a condition with timeout
 * @param {function} condition - Function that returns true when condition is met
 * @param {number} timeout - Maximum time to wait in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise<void>}
 */
async function waitFor(condition, timeout = 2000, interval = 50) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Condition not met within timeout');
}

describe('Integration Tests - Full Telemetry Service', () => {
  let httpServer;
  let logBuffer;
  let aggregator;
  let logReceiver;
  let heartbeatReceiver;
  let logPort;
  let heartbeatPort;

  beforeEach(async () => {
    // Initialize components
    logBuffer = createLogBuffer(100);
    aggregator = createAggregator({ heartbeatTimeout: 5000 });

    // Start HTTP server on ephemeral port
    httpServer = await createServer({
      port: 0,
      logBuffer,
      aggregator
    });

    // Create log receiver on ephemeral port
    logReceiver = await createUdpReceiver(0, (data, rinfo) => {
      const entry = logBuffer.add({
        ...data,
        source: `${rinfo.address}:${rinfo.port}`
      });
      httpServer.broadcastLog(entry);
    });
    logPort = logReceiver.port;

    // Create heartbeat receiver on ephemeral port
    heartbeatReceiver = await createUdpReceiver(0, (data, rinfo) => {
      try {
        const deviceState = aggregator.updateDevice({
          ...data,
          source: `${rinfo.address}:${rinfo.port}`
        });
        httpServer.broadcastHeartbeat(deviceState);
      } catch (err) {
        // Ignore heartbeat errors in tests
      }
    });
    heartbeatPort = heartbeatReceiver.port;
  });

  afterEach(async () => {
    // Clean up in reverse order of creation
    if (heartbeatReceiver) await heartbeatReceiver.close();
    if (logReceiver) await logReceiver.close();
    if (httpServer) await httpServer.close();
  });

  describe('End-to-end log flow', () => {
    test('logs sent via UDP appear in /api/logs', async () => {
      // Send a log entry via UDP
      await sendUdp(logPort, {
        ts: Date.now(),
        level: 'info',
        component: 'test-component',
        msg: 'Integration test message'
      });

      // Wait for the log to be processed
      await waitFor(() => logBuffer.size > 0);

      // Verify via API
      const response = await httpGet(`${httpServer.url}/api/logs`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 1);
      assert.strictEqual(data.logs[0].level, 'info');
      assert.strictEqual(data.logs[0].component, 'test-component');
      assert.strictEqual(data.logs[0].msg, 'Integration test message');
      assert.ok(data.logs[0].source, 'should have source IP:port');
    });

    test('multiple logs are stored in order (newest first)', async () => {
      // Send multiple logs
      await sendUdp(logPort, { level: 'info', msg: 'first' });
      await waitFor(() => logBuffer.size >= 1);

      await sendUdp(logPort, { level: 'warn', msg: 'second' });
      await waitFor(() => logBuffer.size >= 2);

      await sendUdp(logPort, { level: 'error', msg: 'third' });
      await waitFor(() => logBuffer.size >= 3);

      const response = await httpGet(`${httpServer.url}/api/logs`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 3);
      assert.strictEqual(data.logs[0].msg, 'third');
      assert.strictEqual(data.logs[1].msg, 'second');
      assert.strictEqual(data.logs[2].msg, 'first');
    });

    test('logs can be filtered by level via API', async () => {
      await sendUdp(logPort, { level: 'info', msg: 'info log' });
      await sendUdp(logPort, { level: 'error', msg: 'error log' });
      await sendUdp(logPort, { level: 'warn', msg: 'warn log' });

      await waitFor(() => logBuffer.size >= 3);

      const response = await httpGet(`${httpServer.url}/api/logs?level=error`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 1);
      assert.strictEqual(data.logs[0].level, 'error');
    });

    test('logs can be filtered by component via API', async () => {
      await sendUdp(logPort, { level: 'info', component: 'sender', msg: 'from sender' });
      await sendUdp(logPort, { level: 'info', component: 'renderer', msg: 'from renderer' });

      await waitFor(() => logBuffer.size >= 2);

      const response = await httpGet(`${httpServer.url}/api/logs?component=sender`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 1);
      assert.strictEqual(data.logs[0].component, 'sender');
    });
  });

  describe('End-to-end heartbeat flow', () => {
    test('heartbeats sent via UDP appear in /api/devices', async () => {
      // Send a heartbeat
      await sendUdp(heartbeatPort, {
        id: 'LEFT',
        seq: 1,
        uptime: 10000,
        freeHeap: 50000
      });

      // Wait for processing
      await waitFor(() => aggregator.deviceCount > 0);

      // Verify via API
      const response = await httpGet(`${httpServer.url}/api/devices`);
      const data = parseJson(response);

      assert.strictEqual(data.devices.length, 1);
      assert.strictEqual(data.devices[0].id, 'LEFT');
      assert.strictEqual(data.devices[0].uptime, 10000);
      assert.strictEqual(data.devices[0].freeHeap, 50000);
      assert.strictEqual(data.devices[0].status, 'online');
    });

    test('multiple devices are tracked separately', async () => {
      await sendUdp(heartbeatPort, { id: 'LEFT', seq: 1 });
      await sendUdp(heartbeatPort, { id: 'RIGHT', seq: 1 });

      await waitFor(() => aggregator.deviceCount >= 2);

      const response = await httpGet(`${httpServer.url}/api/devices`);
      const data = parseJson(response);

      assert.strictEqual(data.devices.length, 2);
      const deviceIds = data.devices.map(d => d.id).sort();
      assert.deepStrictEqual(deviceIds, ['LEFT', 'RIGHT']);
    });

    test('device state is updated on subsequent heartbeats', async () => {
      await sendUdp(heartbeatPort, { id: 'LEFT', seq: 1, uptime: 1000 });
      await waitFor(() => aggregator.deviceCount > 0);

      await sendUdp(heartbeatPort, { id: 'LEFT', seq: 2, uptime: 2000 });
      await waitFor(() => {
        const device = aggregator.getDevice('LEFT');
        return device && device.uptime === 2000;
      });

      const response = await httpGet(`${httpServer.url}/api/devices`);
      const data = parseJson(response);

      assert.strictEqual(data.devices.length, 1);
      assert.strictEqual(data.devices[0].uptime, 2000);
      assert.strictEqual(data.devices[0].heartbeatCount, 2);
    });

    test('system health reflects device status', async () => {
      // No devices initially
      let response = await httpGet(`${httpServer.url}/api/status`);
      let data = parseJson(response);
      assert.strictEqual(data.systemHealth.status, 'unknown');
      assert.strictEqual(data.systemHealth.totalDevices, 0);

      // Add a healthy device
      await sendUdp(heartbeatPort, { id: 'LEFT', seq: 1 });
      await waitFor(() => aggregator.deviceCount > 0);

      response = await httpGet(`${httpServer.url}/api/status`);
      data = parseJson(response);
      assert.strictEqual(data.systemHealth.status, 'healthy');
      assert.strictEqual(data.systemHealth.totalDevices, 1);
      assert.strictEqual(data.systemHealth.onlineDevices, 1);
    });
  });

  describe('Combined log and heartbeat flow', () => {
    test('both logs and heartbeats work simultaneously', async () => {
      // Send logs and heartbeats concurrently
      await Promise.all([
        sendUdp(logPort, { level: 'info', component: 'sender', msg: 'test log 1' }),
        sendUdp(logPort, { level: 'warn', component: 'renderer', msg: 'test log 2' }),
        sendUdp(heartbeatPort, { id: 'LEFT', seq: 1, uptime: 5000 }),
        sendUdp(heartbeatPort, { id: 'RIGHT', seq: 1, uptime: 6000 })
      ]);

      // Wait for all to be processed
      await waitFor(() => logBuffer.size >= 2 && aggregator.deviceCount >= 2);

      // Verify logs
      const logsResponse = await httpGet(`${httpServer.url}/api/logs`);
      const logsData = parseJson(logsResponse);
      assert.strictEqual(logsData.logs.length, 2);

      // Verify devices
      const devicesResponse = await httpGet(`${httpServer.url}/api/devices`);
      const devicesData = parseJson(devicesResponse);
      assert.strictEqual(devicesData.devices.length, 2);

      // Verify status combines both
      const statusResponse = await httpGet(`${httpServer.url}/api/status`);
      const statusData = parseJson(statusResponse);
      assert.strictEqual(statusData.logBufferSize, 2);
      assert.strictEqual(statusData.systemHealth.totalDevices, 2);
    });
  });

  describe('Dashboard accessibility', () => {
    test('dashboard HTML is served at root', async () => {
      const response = await httpGet(`${httpServer.url}/`);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers['content-type'], 'text/html');
      assert.ok(response.body.includes('<!DOCTYPE html>'));
      assert.ok(response.body.includes('LED Lights Telemetry'));
    });
  });

  describe('Error handling', () => {
    test('malformed UDP messages do not crash the service', async () => {
      // Send invalid JSON
      const socket = dgram.createSocket('udp4');
      const badMessage = Buffer.from('not valid json {{{');

      await new Promise((resolve, reject) => {
        socket.send(badMessage, 0, badMessage.length, logPort, '127.0.0.1', (err) => {
          socket.close();
          if (err) reject(err);
          else resolve();
        });
      });

      // Give time for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Service should still work
      const response = await httpGet(`${httpServer.url}/api/status`);
      assert.strictEqual(response.status, 200);
    });

    test('heartbeat without id is handled gracefully', async () => {
      // Send heartbeat without required id field
      await sendUdp(heartbeatPort, { seq: 1, uptime: 1000 });

      // Give time for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have added any device
      const response = await httpGet(`${httpServer.url}/api/devices`);
      const data = parseJson(response);
      assert.strictEqual(data.devices.length, 0);
    });
  });
});
