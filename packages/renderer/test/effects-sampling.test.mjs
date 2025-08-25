import test from 'node:test';
import assert from 'assert/strict';
import { bilinearSampleRGB, sliceSection } from '../src/effects.mjs';

// helper to compare arrays with numbers precisely
const eq = (a, b) => assert.deepEqual(a.map(n => +n.toFixed(5)), b.map(n => +n.toFixed(5)));

const sceneF32 = Float32Array.from([
  // row 0: red, green
  1, 0, 0,
  0, 1, 0,
  // row 1: blue, white
  0, 0, 1,
  1, 1, 1,
]);

const W = 2, H = 2;

test('bilinearSampleRGB corners and midpoints', () => {
  eq(bilinearSampleRGB(sceneF32, W, H, 0, 0), [1, 0, 0]);
  eq(bilinearSampleRGB(sceneF32, W, H, 1, 0), [0, 1, 0]);
  eq(bilinearSampleRGB(sceneF32, W, H, 0, 1), [0, 0, 1]);
  eq(bilinearSampleRGB(sceneF32, W, H, 1, 1), [1, 1, 1]);

  eq(bilinearSampleRGB(sceneF32, W, H, 0.5, 0), [0.5, 0.5, 0]);
  eq(bilinearSampleRGB(sceneF32, W, H, 0, 0.5), [0.5, 0, 0.5]);
  eq(bilinearSampleRGB(sceneF32, W, H, 1, 0.5), [0.5, 1, 0.5]);
  eq(bilinearSampleRGB(sceneF32, W, H, 0.5, 1), [0.5, 0.5, 1]);
  eq(bilinearSampleRGB(sceneF32, W, H, 0.5, 0.5), [0.5, 0.5, 0.5]);
});

test('sliceSection returns expected byte colors', () => {
  const section = { led_count: 3, x0: 0, x1: 1, y: 0 };
  const sampling = { width: 1, height: 1 };
  const bytes = sliceSection(sceneF32, W, H, section, sampling);
  assert.equal(bytes.length, 9);
  const mid = Math.round(0.5 * 255);
  assert.deepEqual(Array.from(bytes), [255, 0, 0, mid, mid, 0, 0, 255, 0]);
});
