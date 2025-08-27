import test from 'node:test';
import assert from 'assert/strict';
import * as gradient from '../src/effects/library/gradient.mjs';

const eq = (a, b) => assert.deepEqual(a.map(n => +n.toFixed(5)), b.map(n => +n.toFixed(5)));
const get = (scene, W, x, y) => {
  const i = (y * W + x) * 3;
  return [scene[i], scene[i + 1], scene[i + 2]];
};

test('reverse parameter flips gradient direction', () => {
  const W = 4, H = 1;
  const scene = new Float32Array(W * H * 3);
  const stops = [
    { pos: 0, color: [0, 0, 0] },
    { pos: 1, color: [1, 0, 0] },
  ];
  gradient.render(scene, W, H, 0, { stops, gradPhase: 0, reverse: false });
  eq(get(scene, W, 0, 0), [0, 0, 0]);
  eq(get(scene, W, 3, 0), [0.75, 0, 0]);
  gradient.render(scene, W, H, 0, { stops, gradPhase: 0, reverse: true });
  eq(get(scene, W, 0, 0), [1, 0, 0]);
  eq(get(scene, W, 3, 0), [0.25, 0, 0]);
});
