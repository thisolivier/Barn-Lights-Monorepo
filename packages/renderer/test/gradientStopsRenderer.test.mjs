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
