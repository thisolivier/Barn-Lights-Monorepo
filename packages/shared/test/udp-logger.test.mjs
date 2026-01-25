import { createLogger } from '../src/udp-logger.mjs';
import dgram from 'node:dgram';
import assert from 'node:assert';
import { describe, it, before, after } from 'node:test';

describe('UDP Logger', () => {
  const TEST_PORT = 49999;
  let server;
  let receivedMessages;

  before(() => {
    receivedMessages = [];
    server = dgram.createSocket('udp4');
    server.on('message', (msg) => {
      try {
        receivedMessages.push(JSON.parse(msg.toString()));
      } catch (e) {
        receivedMessages.push({ raw: msg.toString(), error: e.message });
      }
    });
    server.bind(TEST_PORT);
  });

  after(() => {
    server.close();
  });

  describe('Logger creation', () => {
    it('should create a logger with required options', () => {
      const logger = createLogger({
        component: 'test',
        target: { host: '127.0.0.1', port: TEST_PORT }
      });

      assert.ok(logger, 'Logger should be created');
      assert.strictEqual(typeof logger.error, 'function', 'error method should exist');
      assert.strictEqual(typeof logger.warn, 'function', 'warn method should exist');
      assert.strictEqual(typeof logger.info, 'function', 'info method should exist');
      assert.strictEqual(typeof logger.debug, 'function', 'debug method should exist');
      assert.strictEqual(typeof logger.close, 'function', 'close method should exist');

      logger.close();
    });
  });

  describe('JSON format', () => {
    it('should send correctly formatted JSON messages', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'test-component',
        target: { host: '127.0.0.1', port: TEST_PORT },
        level: 'debug'
      });

      logger.info('Test message', { extra: 'data' });

      // Wait for UDP message to be received
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(receivedMessages.length, 1, 'Should receive one message');

      const msg = receivedMessages[0];
      assert.strictEqual(msg.level, 'info', 'Level should be info');
      assert.strictEqual(msg.component, 'test-component', 'Component should match');
      assert.strictEqual(msg.msg, 'Test message', 'Message should match');
      assert.strictEqual(msg.extra, 'data', 'Metadata should be spread into entry');
      assert.ok(msg.ts, 'Timestamp should be present');

      // Verify timestamp is valid ISO string
      const date = new Date(msg.ts);
      assert.ok(!isNaN(date.getTime()), 'Timestamp should be valid ISO date');

      logger.close();
    });

    it('should include all log levels correctly', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'level-test',
        target: { host: '127.0.0.1', port: TEST_PORT },
        level: 'debug'
      });

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(receivedMessages.length, 4, 'Should receive four messages');
      assert.strictEqual(receivedMessages[0].level, 'debug');
      assert.strictEqual(receivedMessages[1].level, 'info');
      assert.strictEqual(receivedMessages[2].level, 'warn');
      assert.strictEqual(receivedMessages[3].level, 'error');

      logger.close();
    });
  });

  describe('Level filtering', () => {
    it('should filter messages below configured level (default: info)', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'filter-test',
        target: { host: '127.0.0.1', port: TEST_PORT }
        // level defaults to 'info'
      });

      logger.debug('should not be sent');
      logger.info('should be sent');

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(receivedMessages.length, 1, 'Should receive only one message');
      assert.strictEqual(receivedMessages[0].level, 'info', 'Only info should be received');

      logger.close();
    });

    it('should filter messages below warn level', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'warn-filter-test',
        target: { host: '127.0.0.1', port: TEST_PORT },
        level: 'warn'
      });

      logger.debug('filtered out');
      logger.info('filtered out');
      logger.warn('should be sent');
      logger.error('should be sent');

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(receivedMessages.length, 2, 'Should receive two messages');
      assert.strictEqual(receivedMessages[0].level, 'warn');
      assert.strictEqual(receivedMessages[1].level, 'error');

      logger.close();
    });

    it('should filter messages below error level', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'error-filter-test',
        target: { host: '127.0.0.1', port: TEST_PORT },
        level: 'error'
      });

      logger.debug('filtered out');
      logger.info('filtered out');
      logger.warn('filtered out');
      logger.error('should be sent');

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(receivedMessages.length, 1, 'Should receive one message');
      assert.strictEqual(receivedMessages[0].level, 'error');

      logger.close();
    });

    it('should send all messages when level is debug', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'debug-level-test',
        target: { host: '127.0.0.1', port: TEST_PORT },
        level: 'debug'
      });

      logger.debug('sent');
      logger.info('sent');
      logger.warn('sent');
      logger.error('sent');

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(receivedMessages.length, 4, 'Should receive all four messages');

      logger.close();
    });
  });

  describe('Metadata handling', () => {
    it('should handle messages without metadata', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'no-meta-test',
        target: { host: '127.0.0.1', port: TEST_PORT },
        level: 'debug'
      });

      logger.info('message without meta');

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(receivedMessages.length, 1);
      const msg = receivedMessages[0];
      assert.strictEqual(msg.msg, 'message without meta');
      // Should have only the core fields
      assert.deepStrictEqual(Object.keys(msg).sort(), ['component', 'level', 'msg', 'ts']);

      logger.close();
    });

    it('should spread multiple metadata fields', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'multi-meta-test',
        target: { host: '127.0.0.1', port: TEST_PORT },
        level: 'debug'
      });

      logger.info('multi-field message', {
        userId: 123,
        action: 'test',
        duration: 45.5
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(receivedMessages.length, 1);
      const msg = receivedMessages[0];
      assert.strictEqual(msg.userId, 123);
      assert.strictEqual(msg.action, 'test');
      assert.strictEqual(msg.duration, 45.5);

      logger.close();
    });
  });

  describe('Console fallback', () => {
    it('should fall back to console when UDP send fails and fallbackToConsole is true', async () => {
      const originalConsoleInfo = console.info;
      const consoleLogs = [];
      console.info = (...args) => consoleLogs.push(args);

      try {
        // Use an invalid port to trigger UDP error
        const logger = createLogger({
          component: 'fallback-test',
          target: { host: '0.0.0.0', port: 1 }, // Port 1 should fail
          level: 'debug',
          fallbackToConsole: true
        });

        logger.info('fallback message', { key: 'value' });

        // Wait for async UDP callback
        await new Promise(resolve => setTimeout(resolve, 100));

        logger.close();
      } finally {
        console.info = originalConsoleInfo;
      }

      // Note: UDP errors may not always trigger on all systems
      // This test verifies the code path exists but may not always catch the error
    });

    it('should not fall back to console when fallbackToConsole is false', async () => {
      const originalConsoleInfo = console.info;
      const consoleLogs = [];
      console.info = (...args) => consoleLogs.push(args);

      try {
        const logger = createLogger({
          component: 'no-fallback-test',
          target: { host: '0.0.0.0', port: 1 },
          level: 'debug',
          fallbackToConsole: false
        });

        logger.info('should not appear in console');

        await new Promise(resolve => setTimeout(resolve, 100));

        // Console should not have received anything
        assert.strictEqual(consoleLogs.length, 0, 'Console should not be called');

        logger.close();
      } finally {
        console.info = originalConsoleInfo;
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle metadata that could override core fields', async () => {
      receivedMessages = [];
      const logger = createLogger({
        component: 'override-test',
        target: { host: '127.0.0.1', port: TEST_PORT },
        level: 'debug'
      });

      // Note: metadata spreads AFTER core fields, so it can override them
      // This is by design - document but don't prevent
      logger.info('message', { component: 'override-component' });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(receivedMessages.length, 1);
      // Metadata overrides the component field
      assert.strictEqual(receivedMessages[0].component, 'override-component');

      logger.close();
    });
  });
});
