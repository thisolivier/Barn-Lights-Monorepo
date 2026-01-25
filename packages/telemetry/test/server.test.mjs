import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { createServer } from '../src/server.mjs';
import { createLogBuffer } from '../src/log-buffer.mjs';
import { createAggregator } from '../src/aggregator.mjs';

/**
 * Helper to make HTTP requests
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

describe('Telemetry HTTP Server', () => {
  let server;
  let logBuffer;
  let aggregator;
  const testPort = 0; // Use ephemeral port

  beforeEach(async () => {
    logBuffer = createLogBuffer(100);
    aggregator = createAggregator({ heartbeatTimeout: 5000 });
    server = await createServer({
      port: testPort,
      logBuffer,
      aggregator
    });
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('GET /api/status', () => {
    test('returns system health and device status', async () => {
      const response = await httpGet(`${server.url}/api/status`);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers['content-type'], 'application/json');

      const data = parseJson(response);
      assert.ok(data.systemHealth, 'should have systemHealth');
      assert.strictEqual(data.systemHealth.status, 'unknown');
      assert.strictEqual(data.systemHealth.totalDevices, 0);
      assert.ok(Array.isArray(data.devices), 'should have devices array');
      assert.strictEqual(data.logBufferSize, 0);
      assert.strictEqual(data.logBufferMaxSize, 100);
      assert.ok(data.timestamp > 0, 'should have timestamp');
    });

    test('reflects device state after heartbeat', async () => {
      // Add a device
      aggregator.updateDevice({ id: 'LEFT', seq: 1, uptime: 1000 });

      const response = await httpGet(`${server.url}/api/status`);
      const data = parseJson(response);

      assert.strictEqual(data.systemHealth.totalDevices, 1);
      assert.strictEqual(data.systemHealth.onlineDevices, 1);
      assert.strictEqual(data.devices.length, 1);
      assert.strictEqual(data.devices[0].id, 'LEFT');
    });

    test('reflects log buffer size', async () => {
      // Add some logs
      logBuffer.add({ level: 'info', msg: 'test 1' });
      logBuffer.add({ level: 'warn', msg: 'test 2' });
      logBuffer.add({ level: 'error', msg: 'test 3' });

      const response = await httpGet(`${server.url}/api/status`);
      const data = parseJson(response);

      assert.strictEqual(data.logBufferSize, 3);
    });
  });

  describe('GET /api/logs', () => {
    test('returns empty logs array when buffer is empty', async () => {
      const response = await httpGet(`${server.url}/api/logs`);

      assert.strictEqual(response.status, 200);

      const data = parseJson(response);
      assert.ok(Array.isArray(data.logs), 'should have logs array');
      assert.strictEqual(data.logs.length, 0);
      assert.strictEqual(data.total, 0);
    });

    test('returns logs from buffer', async () => {
      logBuffer.add({ level: 'info', component: 'test', msg: 'hello' });
      logBuffer.add({ level: 'error', component: 'test', msg: 'world' });

      const response = await httpGet(`${server.url}/api/logs`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 2);
      assert.strictEqual(data.total, 2);
      // Logs are newest first
      assert.strictEqual(data.logs[0].msg, 'world');
      assert.strictEqual(data.logs[1].msg, 'hello');
    });

    test('filters by level', async () => {
      logBuffer.add({ level: 'info', msg: 'info message' });
      logBuffer.add({ level: 'error', msg: 'error message' });
      logBuffer.add({ level: 'warn', msg: 'warn message' });

      const response = await httpGet(`${server.url}/api/logs?level=error`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 1);
      assert.strictEqual(data.logs[0].level, 'error');
    });

    test('filters by component', async () => {
      logBuffer.add({ level: 'info', component: 'sender', msg: 'from sender' });
      logBuffer.add({ level: 'info', component: 'renderer', msg: 'from renderer' });

      const response = await httpGet(`${server.url}/api/logs?component=sender`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 1);
      assert.strictEqual(data.logs[0].component, 'sender');
    });

    test('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        logBuffer.add({ level: 'info', msg: `message ${i}` });
      }

      const response = await httpGet(`${server.url}/api/logs?limit=3`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 3);
      assert.strictEqual(data.total, 10);
    });

    test('combines multiple filters', async () => {
      logBuffer.add({ level: 'info', component: 'sender', msg: 'info sender' });
      logBuffer.add({ level: 'error', component: 'sender', msg: 'error sender' });
      logBuffer.add({ level: 'error', component: 'renderer', msg: 'error renderer' });

      const response = await httpGet(`${server.url}/api/logs?level=error&component=sender`);
      const data = parseJson(response);

      assert.strictEqual(data.logs.length, 1);
      assert.strictEqual(data.logs[0].msg, 'error sender');
    });
  });

  describe('GET /api/devices', () => {
    test('returns empty devices array when no devices', async () => {
      const response = await httpGet(`${server.url}/api/devices`);

      assert.strictEqual(response.status, 200);

      const data = parseJson(response);
      assert.ok(Array.isArray(data.devices), 'should have devices array');
      assert.strictEqual(data.devices.length, 0);
    });

    test('returns device states', async () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1, uptime: 5000 });
      aggregator.updateDevice({ id: 'RIGHT', seq: 1, uptime: 6000 });

      const response = await httpGet(`${server.url}/api/devices`);
      const data = parseJson(response);

      assert.strictEqual(data.devices.length, 2);

      const deviceIds = data.devices.map(d => d.id).sort();
      assert.deepStrictEqual(deviceIds, ['LEFT', 'RIGHT']);
    });

    test('includes device metrics', async () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1, uptime: 5000, freeHeap: 10000 });

      const response = await httpGet(`${server.url}/api/devices`);
      const data = parseJson(response);

      const device = data.devices[0];
      assert.strictEqual(device.id, 'LEFT');
      assert.strictEqual(device.uptime, 5000);
      assert.strictEqual(device.freeHeap, 10000);
      assert.ok('status' in device, 'should have status');
      assert.ok('packetLoss' in device, 'should have packetLoss');
    });
  });

  describe('GET /', () => {
    test('serves dashboard HTML', async () => {
      const response = await httpGet(`${server.url}/`);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers['content-type'], 'text/html');
      assert.ok(response.body.includes('<!DOCTYPE html>'), 'should be HTML');
      assert.ok(response.body.includes('LED Lights Telemetry'), 'should contain title');
    });
  });

  describe('GET /index.html', () => {
    test('serves dashboard HTML at /index.html', async () => {
      const response = await httpGet(`${server.url}/index.html`);

      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.headers['content-type'], 'text/html');
    });
  });

  describe('404 handling', () => {
    test('returns 404 for unknown routes', async () => {
      const response = await httpGet(`${server.url}/unknown`);

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.headers['content-type'], 'application/json');

      const data = parseJson(response);
      assert.strictEqual(data.error, 'Not found');
    });
  });

  describe('CORS headers', () => {
    test('includes CORS headers on API responses', async () => {
      const response = await httpGet(`${server.url}/api/status`);

      assert.strictEqual(response.headers['access-control-allow-origin'], '*');
    });
  });

  describe('Server lifecycle', () => {
    test('can close and restart on same port', async () => {
      const originalPort = server.port;
      await server.close();

      // Create new server on same port
      server = await createServer({
        port: originalPort,
        logBuffer,
        aggregator
      });

      const response = await httpGet(`${server.url}/api/status`);
      assert.strictEqual(response.status, 200);
    });
  });
});

describe('Server with missing dependencies', () => {
  test('handles missing logBuffer gracefully', async () => {
    const aggregator = createAggregator();
    const server = await createServer({
      port: 0,
      aggregator,
      logBuffer: null
    });

    try {
      const response = await httpGet(`${server.url}/api/logs`);
      const data = parseJson(response);

      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data.logs));
      assert.strictEqual(data.logs.length, 0);
    } finally {
      await server.close();
    }
  });

  test('handles missing aggregator gracefully', async () => {
    const logBuffer = createLogBuffer(100);
    const server = await createServer({
      port: 0,
      logBuffer,
      aggregator: null
    });

    try {
      const response = await httpGet(`${server.url}/api/devices`);
      const data = parseJson(response);

      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data.devices));
      assert.strictEqual(data.devices.length, 0);
    } finally {
      await server.close();
    }
  });
});
