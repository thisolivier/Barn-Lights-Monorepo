import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Aggregator, createAggregator } from '../src/aggregator.mjs';

describe('Aggregator', () => {
  let aggregator;

  beforeEach(() => {
    aggregator = new Aggregator({ heartbeatTimeout: 1000 });
  });

  describe('constructor', () => {
    it('should create aggregator with default timeout', () => {
      const agg = new Aggregator();
      assert.strictEqual(agg.deviceCount, 0);
    });

    it('should start with no devices', () => {
      assert.strictEqual(aggregator.deviceCount, 0);
    });
  });

  describe('updateDevice()', () => {
    it('should add a new device', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      assert.strictEqual(aggregator.deviceCount, 1);
    });

    it('should throw if heartbeat has no id', () => {
      assert.throws(() => aggregator.updateDevice({ seq: 1 }), {
        message: 'Heartbeat must include device id'
      });
    });

    it('should track multiple devices', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'RIGHT', seq: 1 });
      assert.strictEqual(aggregator.deviceCount, 2);
    });

    it('should update existing device', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'LEFT', seq: 2 });
      assert.strictEqual(aggregator.deviceCount, 1);
    });

    it('should track heartbeat count', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'LEFT', seq: 2 });
      aggregator.updateDevice({ id: 'LEFT', seq: 3 });
      const device = aggregator.getDevice('LEFT');
      assert.strictEqual(device.heartbeatCount, 3);
    });

    it('should preserve additional heartbeat data', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1, uptime: 5000, freeHeap: 10000 });
      const device = aggregator.getDevice('LEFT');
      assert.strictEqual(device.uptime, 5000);
      assert.strictEqual(device.freeHeap, 10000);
    });
  });

  describe('packet loss calculation', () => {
    it('should calculate 0% loss when all packets received', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'LEFT', seq: 2 });
      aggregator.updateDevice({ id: 'LEFT', seq: 3 });
      const device = aggregator.getDevice('LEFT');
      assert.strictEqual(device.packetLoss, 0);
    });

    it('should calculate packet loss when packets are missed', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'LEFT', seq: 4 }); // missed 2, 3
      const device = aggregator.getDevice('LEFT');
      // Expected: 4 packets (seq 1-4), received: 2, loss: 50%
      assert.strictEqual(device.packetLoss, 50);
    });

    it('should reset counters on sequence wrap/restart', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 100 });
      aggregator.updateDevice({ id: 'LEFT', seq: 1 }); // restart
      const device = aggregator.getDevice('LEFT');
      assert.strictEqual(device.packetLoss, 0);
      assert.strictEqual(device.expectedPackets, 1);
      assert.strictEqual(device.receivedPackets, 1);
    });

    it('should handle missing sequence numbers', () => {
      aggregator.updateDevice({ id: 'LEFT' });
      aggregator.updateDevice({ id: 'LEFT' });
      const device = aggregator.getDevice('LEFT');
      assert.strictEqual(device.packetLoss, 0);
    });
  });

  describe('getDevice()', () => {
    it('should return undefined for unknown device', () => {
      const device = aggregator.getDevice('UNKNOWN');
      assert.strictEqual(device, undefined);
    });

    it('should return device state with computed metrics', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      const device = aggregator.getDevice('LEFT');
      assert.strictEqual(device.id, 'LEFT');
      assert.ok(device.hasOwnProperty('timeSinceLastHeartbeat'));
      assert.ok(device.hasOwnProperty('online'));
      assert.ok(device.hasOwnProperty('status'));
    });

    it('should mark device as online when recently seen', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      const device = aggregator.getDevice('LEFT');
      assert.strictEqual(device.online, true);
      assert.strictEqual(device.status, 'online');
    });
  });

  describe('getAllDevices()', () => {
    it('should return empty array when no devices', () => {
      const devices = aggregator.getAllDevices();
      assert.deepStrictEqual(devices, []);
    });

    it('should return all devices with computed metrics', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'RIGHT', seq: 1 });
      const devices = aggregator.getAllDevices();
      assert.strictEqual(devices.length, 2);
      assert.ok(devices.every(d => d.hasOwnProperty('online')));
    });
  });

  describe('getSystemHealth()', () => {
    it('should return unknown status when no devices', () => {
      const health = aggregator.getSystemHealth();
      assert.strictEqual(health.status, 'unknown');
      assert.strictEqual(health.totalDevices, 0);
    });

    it('should return healthy status when all devices online with low packet loss', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'RIGHT', seq: 1 });
      const health = aggregator.getSystemHealth();
      assert.strictEqual(health.status, 'healthy');
      assert.strictEqual(health.totalDevices, 2);
      assert.strictEqual(health.onlineDevices, 2);
      assert.strictEqual(health.offlineDevices, 0);
    });

    it('should include device summary', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      const health = aggregator.getSystemHealth();
      assert.ok(Array.isArray(health.devices));
      assert.strictEqual(health.devices[0].id, 'LEFT');
      assert.strictEqual(health.devices[0].status, 'online');
    });

    it('should calculate average packet loss', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'LEFT', seq: 3 }); // 50% loss
      const health = aggregator.getSystemHealth();
      assert.ok(typeof health.avgPacketLoss === 'number');
    });
  });

  describe('device timeout', () => {
    it('should mark device as offline after timeout', async () => {
      const quickTimeout = new Aggregator({ heartbeatTimeout: 50 });
      quickTimeout.updateDevice({ id: 'LEFT', seq: 1 });

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      const device = quickTimeout.getDevice('LEFT');
      assert.strictEqual(device.online, false);
      assert.strictEqual(device.status, 'offline');
    });

    it('should report degraded status with offline devices', async () => {
      const quickTimeout = new Aggregator({ heartbeatTimeout: 50 });
      quickTimeout.updateDevice({ id: 'LEFT', seq: 1 });
      quickTimeout.updateDevice({ id: 'RIGHT', seq: 1 });

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      const health = quickTimeout.getSystemHealth();
      assert.strictEqual(health.offlineDevices, 2);
      assert.strictEqual(health.status, 'critical');
    });
  });

  describe('clear()', () => {
    it('should remove all devices', () => {
      aggregator.updateDevice({ id: 'LEFT', seq: 1 });
      aggregator.updateDevice({ id: 'RIGHT', seq: 1 });
      aggregator.clear();
      assert.strictEqual(aggregator.deviceCount, 0);
    });
  });

  describe('createAggregator()', () => {
    it('should create an Aggregator instance', () => {
      const agg = createAggregator({ heartbeatTimeout: 2000 });
      assert.ok(agg instanceof Aggregator);
    });

    it('should work with default options', () => {
      const agg = createAggregator();
      assert.ok(agg instanceof Aggregator);
    });
  });
});
