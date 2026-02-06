import test from 'node:test';
import assert from 'assert/strict';
import { readFile, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';
import { parseGif, loadGifIntoCache, getCachedGif, clearGifCache, render, defaultParams } from '../src/effects/library/gif.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('parseGif parses a valid GIF file', async () => {
  const gifsDir = path.join(ROOT, 'config', 'gifs');
  const entries = await readdir(gifsDir);
  const firstGif = entries.find(name => name.toLowerCase().endsWith('.gif'));
  assert.ok(firstGif, 'Need at least one GIF in config/gifs/ for this test');
  const gifPath = path.join(gifsDir, firstGif);
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
  assert.equal(defaultParams.scaleWidth, 100);
  assert.equal(defaultParams.scaleHeight, 100);
});

test('full pipeline: readFile -> parseGif -> cache -> render produces non-purple pixels', async () => {
  const gifsDir = path.join(ROOT, 'config', 'gifs');
  const entries = await readdir(gifsDir);
  const firstGif = entries.find(name => name.toLowerCase().endsWith('.gif'));
  assert.ok(firstGif, 'Need at least one GIF in config/gifs/ for this test');
  const gifPath = path.join(gifsDir, firstGif);
  const buffer = await readFile(gifPath);
  const gifData = parseGif(buffer);

  assert.ok(gifData.frames.length > 0, 'GIF should have at least one frame');

  const cacheKey = 'test/giphy-pipeline.gif';
  loadGifIntoCache(cacheKey, gifData);

  const sceneWidth = 16;
  const sceneHeight = 8;
  const sceneF32 = new Float32Array(sceneWidth * sceneHeight * 3);
  render(sceneF32, sceneWidth, sceneHeight, 0, { gifPath: cacheKey });

  // Verify pixels are NOT all purple (0.3, 0.0, 0.3)
  let allPurple = true;
  for (let i = 0; i < sceneF32.length; i += 3) {
    const isPurple = Math.abs(sceneF32[i] - 0.3) < 0.001
      && Math.abs(sceneF32[i + 1] - 0.0) < 0.001
      && Math.abs(sceneF32[i + 2] - 0.3) < 0.001;
    if (!isPurple) { allPurple = false; break; }
  }
  assert.ok(!allPurple, 'Rendered pixels should not all be purple');

  // Verify pixel variation (not a uniform flat color)
  const uniqueColors = new Set();
  for (let i = 0; i < sceneF32.length; i += 3) {
    const key = `${sceneF32[i].toFixed(3)},${sceneF32[i + 1].toFixed(3)},${sceneF32[i + 2].toFixed(3)}`;
    uniqueColors.add(key);
  }
  assert.ok(uniqueColors.size > 1, 'Rendered scene should contain varied pixel colors');

  clearGifCache(cacheKey);
});

test('full pipeline with user GIF from config/gifs/', async () => {
  const gifsDir = path.join(ROOT, 'config', 'gifs');
  let gifFiles;
  try {
    const entries = await readdir(gifsDir);
    gifFiles = entries.filter(name => name.toLowerCase().endsWith('.gif'));
  } catch {
    gifFiles = [];
  }

  if (gifFiles.length === 0) {
    return; // Skip gracefully if no user GIFs present
  }

  const gifFileName = gifFiles[0];
  const gifFilePath = path.join(gifsDir, gifFileName);
  const buffer = await readFile(gifFilePath);
  const gifData = parseGif(buffer);

  assert.ok(gifData.frames.length > 0, `${gifFileName} should have at least one frame`);

  const cacheKey = `test/user-gif-${gifFileName}`;
  loadGifIntoCache(cacheKey, gifData);

  const sceneWidth = 16;
  const sceneHeight = 8;
  const sceneF32 = new Float32Array(sceneWidth * sceneHeight * 3);
  render(sceneF32, sceneWidth, sceneHeight, 0, { gifPath: cacheKey });

  // Verify pixels are NOT all purple
  let allPurple = true;
  for (let i = 0; i < sceneF32.length; i += 3) {
    const isPurple = Math.abs(sceneF32[i] - 0.3) < 0.001
      && Math.abs(sceneF32[i + 1] - 0.0) < 0.001
      && Math.abs(sceneF32[i + 2] - 0.3) < 0.001;
    if (!isPurple) { allPurple = false; break; }
  }
  assert.ok(!allPurple, 'Rendered user GIF should not be all purple');

  // Verify pixel variation
  const uniqueColors = new Set();
  for (let i = 0; i < sceneF32.length; i += 3) {
    const key = `${sceneF32[i].toFixed(3)},${sceneF32[i + 1].toFixed(3)},${sceneF32[i + 2].toFixed(3)}`;
    uniqueColors.add(key);
  }
  assert.ok(uniqueColors.size > 1, 'User GIF should contain varied pixel colors');

  clearGifCache(cacheKey);
});

test('50% tiling produces 2x2 tile repetition', () => {
  // Create a 2x2 GIF: red, green, blue, white
  const gifWidth = 2;
  const gifHeight = 2;
  const frameData = new Uint8Array(gifWidth * gifHeight * 4);
  // (0,0) red
  frameData[0] = 255; frameData[1] = 0;   frameData[2] = 0;   frameData[3] = 255;
  // (1,0) green
  frameData[4] = 0;   frameData[5] = 255; frameData[6] = 0;   frameData[7] = 255;
  // (0,1) blue
  frameData[8] = 0;   frameData[9] = 0;   frameData[10] = 255; frameData[11] = 255;
  // (1,1) white
  frameData[12] = 255; frameData[13] = 255; frameData[14] = 255; frameData[15] = 255;

  const cacheKey = 'test/tile-50.gif';
  loadGifIntoCache(cacheKey, {
    frames: [{ data: frameData, delay: 100 }],
    width: gifWidth,
    height: gifHeight,
  });

  // Render to 4x4 scene at 50%/50% — each tile is 2x2 pixels, so 2x2 tiles
  const sceneWidth = 4;
  const sceneHeight = 4;
  const sceneF32 = new Float32Array(sceneWidth * sceneHeight * 3);
  render(sceneF32, sceneWidth, sceneHeight, 0, {
    gifPath: cacheKey,
    scaleWidth: 50,
    scaleHeight: 50,
  });

  function getPixel(pixelX, pixelY) {
    const offset = (pixelY * sceneWidth + pixelX) * 3;
    return [sceneF32[offset], sceneF32[offset + 1], sceneF32[offset + 2]];
  }

  // Top-left tile (0,0)-(1,1) should match the 2x2 GIF pattern
  assert.deepEqual(getPixel(0, 0), [1, 0, 0], 'tile(0,0) top-left = red');
  assert.deepEqual(getPixel(1, 0), [0, 1, 0], 'tile(0,0) top-right = green');
  assert.deepEqual(getPixel(0, 1), [0, 0, 1], 'tile(0,0) bottom-left = blue');
  assert.deepEqual(getPixel(1, 1), [1, 1, 1], 'tile(0,0) bottom-right = white');

  // Top-right tile (2,0)-(3,1) should repeat the same pattern
  assert.deepEqual(getPixel(2, 0), [1, 0, 0], 'tile(1,0) top-left = red');
  assert.deepEqual(getPixel(3, 0), [0, 1, 0], 'tile(1,0) top-right = green');
  assert.deepEqual(getPixel(2, 1), [0, 0, 1], 'tile(1,0) bottom-left = blue');
  assert.deepEqual(getPixel(3, 1), [1, 1, 1], 'tile(1,0) bottom-right = white');

  // Bottom-left tile (0,2)-(1,3) should also repeat
  assert.deepEqual(getPixel(0, 2), [1, 0, 0], 'tile(0,1) top-left = red');
  assert.deepEqual(getPixel(1, 2), [0, 1, 0], 'tile(0,1) top-right = green');
  assert.deepEqual(getPixel(0, 3), [0, 0, 1], 'tile(0,1) bottom-left = blue');
  assert.deepEqual(getPixel(1, 3), [1, 1, 1], 'tile(0,1) bottom-right = white');

  clearGifCache(cacheKey);
});

test('100% scale matches output without scale params (backward compat)', () => {
  // Create a 3x2 GIF with a gradient pattern
  const gifWidth = 3;
  const gifHeight = 2;
  const frameData = new Uint8Array(gifWidth * gifHeight * 4);
  for (let row = 0; row < gifHeight; row++) {
    for (let col = 0; col < gifWidth; col++) {
      const offset = (row * gifWidth + col) * 4;
      frameData[offset] = col * 80;
      frameData[offset + 1] = row * 120;
      frameData[offset + 2] = 50;
      frameData[offset + 3] = 255;
    }
  }

  const cacheKey = 'test/compat-100.gif';
  loadGifIntoCache(cacheKey, {
    frames: [{ data: frameData, delay: 100 }],
    width: gifWidth,
    height: gifHeight,
  });

  const sceneWidth = 6;
  const sceneHeight = 4;

  // Render without explicit scale params (defaults to 100%)
  const sceneDefault = new Float32Array(sceneWidth * sceneHeight * 3);
  render(sceneDefault, sceneWidth, sceneHeight, 0, { gifPath: cacheKey });

  // Render with explicit 100%/100%
  const sceneExplicit = new Float32Array(sceneWidth * sceneHeight * 3);
  render(sceneExplicit, sceneWidth, sceneHeight, 0, {
    gifPath: cacheKey,
    scaleWidth: 100,
    scaleHeight: 100,
  });

  // Both should produce identical output
  for (let i = 0; i < sceneDefault.length; i++) {
    assert.equal(sceneDefault[i], sceneExplicit[i],
      `Pixel index ${i} should match between default and explicit 100%`);
  }

  clearGifCache(cacheKey);
});
