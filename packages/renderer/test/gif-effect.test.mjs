import test from 'node:test';
import assert from 'assert/strict';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { parseGif, loadGifIntoCache, getCachedGif, clearGifCache, render, defaultParams } from '../src/effects/library/gif.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('parseGif parses a valid GIF file', async () => {
  const gifPath = path.join(ROOT, 'giphy.gif');
  const buffer = await readFile(gifPath);
  const result = parseGif(buffer);

  assert.ok(result.width > 0, 'GIF should have positive width');
  assert.ok(result.height > 0, 'GIF should have positive height');
  assert.ok(result.frames.length > 0, 'GIF should have at least one frame');

  // Check frame structure
  const frame = result.frames[0];
  assert.ok(frame.data instanceof Uint8Array, 'Frame data should be Uint8Array');
  assert.ok(typeof frame.delay === 'number', 'Frame should have delay');
  assert.equal(frame.data.length, result.width * result.height * 4, 'Frame data should be RGBA');
});

test('loadGifIntoCache and getCachedGif work correctly', async () => {
  const testPath = 'test/path/file.gif';
  const testData = { frames: [{ data: new Uint8Array(4), delay: 100 }], width: 1, height: 1 };

  clearGifCache(testPath);
  assert.equal(getCachedGif(testPath), undefined, 'Cache should be empty initially');

  loadGifIntoCache(testPath, testData);
  assert.deepEqual(getCachedGif(testPath), testData, 'Should retrieve cached data');

  clearGifCache(testPath);
  assert.equal(getCachedGif(testPath), undefined, 'Cache should be cleared');
});

test('render fills scene with dark gray when no gifPath', () => {
  const W = 4;
  const H = 2;
  const sceneF32 = new Float32Array(W * H * 3);

  render(sceneF32, W, H, 0, { gifPath: '' });

  // Check that all pixels are dark gray (0.1)
  for (let i = 0; i < sceneF32.length; i++) {
    assert.ok(Math.abs(sceneF32[i] - 0.1) < 0.001, 'Pixel should be dark gray');
  }
});

test('render fills scene with purple when GIF not loaded', () => {
  const W = 4;
  const H = 2;
  const sceneF32 = new Float32Array(W * H * 3);

  // Use a path that doesn't exist in cache
  render(sceneF32, W, H, 0, { gifPath: 'nonexistent.gif' });

  // Check that pixels are purple (0.3, 0.0, 0.3)
  for (let i = 0; i < sceneF32.length; i += 3) {
    assert.ok(Math.abs(sceneF32[i] - 0.3) < 0.001, 'Red should be 0.3');
    assert.ok(Math.abs(sceneF32[i + 1] - 0.0) < 0.001, 'Green should be 0.0');
    assert.ok(Math.abs(sceneF32[i + 2] - 0.3) < 0.001, 'Blue should be 0.3');
  }
});

test('render uses cached GIF frames', () => {
  const W = 2;
  const H = 2;
  const sceneF32 = new Float32Array(W * H * 3);

  // Create a simple 2x2 cached GIF with red pixels
  const testPath = 'test/cached.gif';
  const frameData = new Uint8Array(W * H * 4);
  for (let i = 0; i < frameData.length; i += 4) {
    frameData[i] = 255;     // R
    frameData[i + 1] = 0;   // G
    frameData[i + 2] = 0;   // B
    frameData[i + 3] = 255; // A
  }
  loadGifIntoCache(testPath, {
    frames: [{ data: frameData, delay: 100 }],
    width: W,
    height: H
  });

  render(sceneF32, W, H, 0, { gifPath: testPath });

  // Check that all pixels are red (1.0, 0.0, 0.0)
  for (let i = 0; i < sceneF32.length; i += 3) {
    assert.ok(Math.abs(sceneF32[i] - 1.0) < 0.001, 'Red should be 1.0');
    assert.ok(Math.abs(sceneF32[i + 1] - 0.0) < 0.001, 'Green should be 0.0');
    assert.ok(Math.abs(sceneF32[i + 2] - 0.0) < 0.001, 'Blue should be 0.0');
  }

  clearGifCache(testPath);
});

test('defaultParams has expected structure', () => {
  assert.equal(defaultParams.gifPath, '');
  assert.equal(defaultParams.speed, 1.0);
});
