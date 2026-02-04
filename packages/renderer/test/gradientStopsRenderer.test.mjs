import test from 'node:test';
import assert from 'assert/strict';
import { renderFrames, SCENE_W, SCENE_H } from '../src/render-scene.mjs';

const makeParams = (stops) => ({
  effect: 'gradient',
  renderMode: 'duplicate',
  effects: { gradient: { stops, gradPhase: 0, reverse: false } },
  post: { brightness: 1, tint: [1,1,1], gamma: 1, strobeHz: 0, strobeDuty: 0.5, strobeLow: 0, pitchSpeed: 0, yawSpeed: 0, pitch: 0, yaw: 0 }
});

test('renderer responds to gradient stop color updates', () => {
  const left = new Float32Array(SCENE_W * SCENE_H * 3);
  const right = new Float32Array(SCENE_W * SCENE_H * 3);
  const params = makeParams([
    { pos: 0, color: [0,0,0] },
    { pos: 1, color: [0,0,0] }
  ]);

  renderFrames(left, right, params, 0);
  assert.equal(left[0], 0);

  params.effects.gradient.stops = [
    { pos: 0, color: [1,0,0] },
    { pos: 1, color: [0,1,0] }
  ];
  renderFrames(left, right, params, 0);
  assert.equal(left[0], 1);
  const lastIndex = (SCENE_W - 1) * 3;
  assert.ok(left[lastIndex + 1] > 0.9);
});

test('renderer renders interpolated middle stop correctly', () => {
  const left = new Float32Array(SCENE_W * SCENE_H * 3);
  const right = new Float32Array(SCENE_W * SCENE_H * 3);

  // Blue at start, red at end
  const params = makeParams([
    { pos: 0, color: [0, 0, 1] },
    { pos: 1, color: [1, 0, 0] }
  ]);

  renderFrames(left, right, params, 0);

  // Middle pixel should be purple-ish (interpolated)
  const middleIndex = Math.floor(SCENE_W / 2) * 3;
  const middleR = left[middleIndex];
  const middleG = left[middleIndex + 1];
  const middleB = left[middleIndex + 2];

  assert.ok(middleR > 0.4 && middleR < 0.6, `middle R should be ~0.5, got ${middleR}`);
  assert.ok(middleG < 0.1, `middle G should be ~0, got ${middleG}`);
  assert.ok(middleB > 0.4 && middleB < 0.6, `middle B should be ~0.5, got ${middleB}`);

  // Now add an interpolated middle stop (as would come from Grapick sampling)
  // The color [0.5, 0, 0.5] is what hexToRgb would return for "rgba(128, 0, 128, 255)"
  params.effects.gradient.stops = [
    { pos: 0, color: [0, 0, 1] },
    { pos: 0.5, color: [0.5019607843137255, 0, 0.5019607843137255] },
    { pos: 1, color: [1, 0, 0] }
  ];

  renderFrames(left, right, params, 0);

  // Middle pixel should still be the same interpolated color
  const newMiddleR = left[middleIndex];
  const newMiddleG = left[middleIndex + 1];
  const newMiddleB = left[middleIndex + 2];

  assert.ok(Math.abs(newMiddleR - 0.5) < 0.1, `after adding stop, middle R should be ~0.5, got ${newMiddleR}`);
  assert.ok(newMiddleG < 0.1, `after adding stop, middle G should be ~0, got ${newMiddleG}`);
  assert.ok(Math.abs(newMiddleB - 0.5) < 0.1, `after adding stop, middle B should be ~0.5, got ${newMiddleB}`);
});
