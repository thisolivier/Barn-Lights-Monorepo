import test from 'node:test';
import assert from 'node:assert';
import { renderFrames, SCENE_W, SCENE_H } from '../src/render-scene.mjs';

const baseParams = {
  effect: 'gradient',
  effects: {
    gradient: {
      stops: [
        { pos: 0, color: [0, 0, 1] },
        { pos: 1, color: [1, 0, 0] },
      ],
      gradPhase: 0,
    },
  },
  post: {
    tint: [1, 1, 1],
    brightness: 1,
    gamma: 1,
    strobeHz: 0,
    strobeDuty: 0.5,
    strobeLow: 0,
    pitchSpeed: 0,
    yawSpeed: 0,
    pitch: 0,
    yaw: 0,
  },
  renderMode: 'duplicate',
};

function assertGradientEdges(frameBuffer) {
  const firstPixel = [frameBuffer[0], frameBuffer[1], frameBuffer[2]];
  const lastIndex = (SCENE_W - 1) * 3;
  const lastPixel = [
    frameBuffer[lastIndex],
    frameBuffer[lastIndex + 1],
    frameBuffer[lastIndex + 2],
  ];
  assert.notDeepStrictEqual(firstPixel, lastPixel);
  return { firstPixel, lastPixel };
}

test('extended mode splits gradient across frames', () => {
  const leftFrame = new Float32Array(SCENE_W * SCENE_H * 3);
  const rightFrame = new Float32Array(SCENE_W * SCENE_H * 3);
  const params = { ...baseParams, renderMode: 'extended' };
  renderFrames(leftFrame, rightFrame, params, 0);
  assertGradientEdges(leftFrame);
  assertGradientEdges(rightFrame);
  assert.notStrictEqual(leftFrame[0], rightFrame[0]);
});

test('mirror mode reflects frame ends', () => {
  const leftFrame = new Float32Array(SCENE_W * SCENE_H * 3);
  const rightFrame = new Float32Array(SCENE_W * SCENE_H * 3);
  const params = { ...baseParams, renderMode: 'mirror' };
  renderFrames(leftFrame, rightFrame, params, 0);
  const leftEdges = assertGradientEdges(leftFrame);
  const rightEdges = assertGradientEdges(rightFrame);
  assert.deepStrictEqual(rightEdges.firstPixel, leftEdges.lastPixel);
  assert.deepStrictEqual(rightEdges.lastPixel, leftEdges.firstPixel);
});

test('duplicate mode copies gradient to both frames', () => {
  const leftFrame = new Float32Array(SCENE_W * SCENE_H * 3);
  const rightFrame = new Float32Array(SCENE_W * SCENE_H * 3);
  renderFrames(leftFrame, rightFrame, baseParams, 0);
  assertGradientEdges(leftFrame);
  assertGradientEdges(rightFrame);
  const lastIndex = (SCENE_W - 1) * 3;
  assert.strictEqual(leftFrame[0], rightFrame[0]);
  assert.strictEqual(leftFrame[1], rightFrame[1]);
  assert.strictEqual(leftFrame[lastIndex], rightFrame[lastIndex]);
  assert.strictEqual(leftFrame[lastIndex + 1], rightFrame[lastIndex + 1]);
});

