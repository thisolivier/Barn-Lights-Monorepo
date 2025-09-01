import test from 'node:test';
import assert from 'node:assert/strict';
import { Telemetry } from '../src/telemetry/index.mjs';
import { Mailbox } from '../src/mailbox/index.mjs';

test('telemetry aggregates repeated errors', () => {
  const logged = [];
  const logger = {
    error: (msg) => logged.push(msg),
    warn: () => {},
    info: () => {},
    debug: () => {},
  };
  const config = {
    sides: {
      left: { runs: [{ run_index: 0, led_count: 1 }] },
    },
    telemetry: { interval_ms: 10 },
  };
  const mailbox = new Mailbox();
  const telemetry = new Telemetry(config, mailbox, logger);
  telemetry.recordError('test error');
  telemetry.recordError('test error');
  telemetry.recordError('another error');
  telemetry.stop();
  assert.ok(logged.includes('test error (2x)'));
  assert.ok(logged.includes('another error (1x)'));
});
