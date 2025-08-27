import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'events';
import { Assembler } from '../src/assembler/index.mjs';

test('assembles run buffers and emits FrameAssembled', () => {
  const frameEmitter = new EventEmitter();
  const layout = {
    side: 'left',
    total_leds: 3,
    runs: [
      {
        run_index: 0,
        led_count: 3,
        sections: [
          { id: 'row_A1', led_count: 2 },
          { id: 'row_A2', led_count: 1 },
        ],
      },
    ],
  };
  const runtimeConfig = { sides: { left: layout } };
  const assembler = new Assembler(runtimeConfig, console);
  assembler.bindFrameEmitter(frameEmitter);

  const assembledFrames = [];
  assembler.on('FrameAssembled', (assembled) => assembledFrames.push(assembled));

  const frame = {
    frame: 7,
    sides: {
      left: {
        row_A1: { length: 2, rgb_b64: Buffer.from([1,2,3,4,5,6]).toString('base64') },
        row_A2: { length: 1, rgb_b64: Buffer.from([7,8,9]).toString('base64') },
      },
    },
  };
  frameEmitter.emit('FrameIngest', frame);

  assert.strictEqual(assembledFrames.length, 1);
  assert.strictEqual(assembledFrames[0].frame_id, 7);
  assert.deepStrictEqual(
    Array.from(assembledFrames[0].runs[0].data),
    [1,2,3,4,5,6,7,8,9],
  );
});

test('drops side when sections are missing or mismatched', () => {
  const frameEmitter = new EventEmitter();
  const layout = {
    side: 'left',
    total_leds: 3,
    runs: [
      {
        run_index: 0,
        led_count: 3,
        sections: [
          { id: 'row_A1', led_count: 2 },
          { id: 'row_A2', led_count: 1 },
        ],
      },
    ],
  };
  const loggerMessages = [];
  const logger = {
    error: (msg) => loggerMessages.push(msg),
    warn() {},
    info() {},
    debug() {},
  };
  const runtimeConfig = { sides: { left: layout } };
  const assembler = new Assembler(runtimeConfig, logger);
  assembler.bindFrameEmitter(frameEmitter);

  const assembledFrames = [];
  assembler.on('FrameAssembled', (assembled) => assembledFrames.push(assembled));

  // Missing second section
  frameEmitter.emit('FrameIngest', {
    frame: 1,
    sides: { left: { row_A1: { length: 2, rgb_b64: Buffer.from([1,2,3,4,5,6]).toString('base64') } } },
  });

  // Length mismatch
  frameEmitter.emit('FrameIngest', {
    frame: 2,
    sides: {
      left: {
        row_A1: { length: 2, rgb_b64: Buffer.from([1,2,3]).toString('base64') },
        row_A2: { length: 1, rgb_b64: Buffer.from([4,5,6]).toString('base64') },
      },
    },
  });

  assert.strictEqual(assembledFrames.length, 0);
  assert(loggerMessages.some((m) => m.includes('Missing section')));
  assert(loggerMessages.some((m) => m.includes('length mismatch')));
});
