import test from 'node:test';
import assert from 'assert/strict';
import * as diagonalStripes from '../src/effects/library/diagonalStripes.mjs';

const eq = (a, b) => assert.deepEqual(a.map(n => +n.toFixed(5)), b.map(n => +n.toFixed(5)));
const get = (scene, W, x, y) => {
  const i = (y * W + x) * 3;
  return [scene[i], scene[i + 1], scene[i + 2]];
};

test('diagonal stripes at 45 degrees', () => {
  const W = 4, H = 4;
  const scene = new Float32Array(W * H * 3);
  diagonalStripes.render(scene, W, H, 0, {
    colorA: [1, 0, 0],
    colorB: [0, 0, 1],
    width: 0.25,
    angle: 45,
  });
  eq(get(scene, W, 0, 0), [1, 0, 0]);
  eq(get(scene, W, 1, 0), [1, 0, 0]);
  eq(get(scene, W, 0, 1), [0, 0, 1]);
  eq(get(scene, W, 2, 2), [1, 0, 0]);
});

test('angle parameter rotates stripes', () => {
  const W = 4, H = 4;
  const scene = new Float32Array(W * H * 3);
  diagonalStripes.render(scene, W, H, 0, {
    colorA: [1, 0, 0],
    colorB: [0, 1, 0],
    width: 0.25,
    angle: 0,
  });
  eq(get(scene, W, 0, 0), [1, 0, 0]);
  eq(get(scene, W, 0, 1), [1, 0, 0]);
  eq(get(scene, W, 2, 0), [0, 1, 0]);
  eq(get(scene, W, 2, 3), [0, 1, 0]);
});
