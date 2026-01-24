import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LogBuffer, createLogBuffer } from '../src/log-buffer.mjs';

describe('LogBuffer', () => {
  let buffer;

  beforeEach(() => {
    buffer = new LogBuffer(10);
  });

  describe('constructor', () => {
    it('should create buffer with default max size of 1000', () => {
      const defaultBuffer = new LogBuffer();
      assert.strictEqual(defaultBuffer.maxSize, 1000);
    });

    it('should create buffer with custom max size', () => {
      assert.strictEqual(buffer.maxSize, 10);
    });

    it('should start with size 0', () => {
      assert.strictEqual(buffer.size, 0);
    });
  });

  describe('add()', () => {
    it('should add entries to the buffer', () => {
      buffer.add({ msg: 'test' });
      assert.strictEqual(buffer.size, 1);
    });

    it('should add receivedAt timestamp if not present', () => {
      const entry = buffer.add({ msg: 'test' });
      assert.ok(entry.receivedAt);
      assert.ok(typeof entry.receivedAt === 'number');
    });

    it('should preserve existing receivedAt timestamp', () => {
      const timestamp = 12345;
      const entry = buffer.add({ msg: 'test', receivedAt: timestamp });
      assert.strictEqual(entry.receivedAt, timestamp);
    });

    it('should not exceed max size', () => {
      for (let i = 0; i < 15; i++) {
        buffer.add({ msg: `message ${i}` });
      }
      assert.strictEqual(buffer.size, 10);
    });

    it('should keep newest entries when exceeding max size', () => {
      for (let i = 0; i < 15; i++) {
        buffer.add({ msg: `message ${i}` });
      }
      const entries = buffer.getAll();
      assert.strictEqual(entries[0].msg, 'message 14');
      assert.strictEqual(entries[9].msg, 'message 5');
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      buffer.add({ level: 'info', component: 'a', msg: '1' });
      buffer.add({ level: 'error', component: 'a', msg: '2' });
      buffer.add({ level: 'info', component: 'b', msg: '3' });
      buffer.add({ level: 'warn', component: 'b', msg: '4' });
      buffer.add({ level: 'error', component: 'b', msg: '5' });
    });

    it('should return all entries with no filters', () => {
      const results = buffer.query();
      assert.strictEqual(results.length, 5);
    });

    it('should filter by level', () => {
      const results = buffer.query({ level: 'error' });
      assert.strictEqual(results.length, 2);
      assert.ok(results.every(e => e.level === 'error'));
    });

    it('should filter by component', () => {
      const results = buffer.query({ component: 'a' });
      assert.strictEqual(results.length, 2);
      assert.ok(results.every(e => e.component === 'a'));
    });

    it('should filter by level and component', () => {
      const results = buffer.query({ level: 'error', component: 'b' });
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].msg, '5');
    });

    it('should apply limit', () => {
      const results = buffer.query({ limit: 3 });
      assert.strictEqual(results.length, 3);
    });

    it('should apply offset', () => {
      const results = buffer.query({ offset: 2 });
      assert.strictEqual(results.length, 3);
      assert.strictEqual(results[0].msg, '3');
    });

    it('should apply limit and offset together', () => {
      const results = buffer.query({ limit: 2, offset: 1 });
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].msg, '4');
      assert.strictEqual(results[1].msg, '3');
    });

    it('should return newest entries first', () => {
      const results = buffer.query();
      assert.strictEqual(results[0].msg, '5');
      assert.strictEqual(results[4].msg, '1');
    });

    it('should return empty array if no matches', () => {
      const results = buffer.query({ level: 'debug' });
      assert.strictEqual(results.length, 0);
    });
  });

  describe('getAll()', () => {
    it('should return all entries', () => {
      buffer.add({ msg: '1' });
      buffer.add({ msg: '2' });
      const entries = buffer.getAll();
      assert.strictEqual(entries.length, 2);
    });

    it('should return a copy of entries', () => {
      buffer.add({ msg: '1' });
      const entries = buffer.getAll();
      entries.push({ msg: 'injected' });
      assert.strictEqual(buffer.size, 1);
    });
  });

  describe('clear()', () => {
    it('should remove all entries', () => {
      buffer.add({ msg: '1' });
      buffer.add({ msg: '2' });
      buffer.clear();
      assert.strictEqual(buffer.size, 0);
    });
  });

  describe('createLogBuffer()', () => {
    it('should create a LogBuffer instance', () => {
      const buf = createLogBuffer(500);
      assert.ok(buf instanceof LogBuffer);
      assert.strictEqual(buf.maxSize, 500);
    });

    it('should use default max size', () => {
      const buf = createLogBuffer();
      assert.strictEqual(buf.maxSize, 1000);
    });
  });
});
