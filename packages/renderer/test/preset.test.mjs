import test from 'node:test';
import assert from 'node:assert/strict';
import { savePreset, loadPreset, listPresets } from '../src/config-store.mjs';
import { unlink, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const presetPath = path.resolve(__dirname, '../config/presets/test.json');
const presetImg = path.resolve(__dirname, '../config/presets/test-image.png');
const presetImgJson = path.resolve(__dirname, '../config/presets/test-image.json');

const sampleParams = {
  fpsCap: 30,
  renderMode: 'mirror',
  effect: 'solid',
  effects: {
    solid: { r: 1, g: 0, b: 0 },
    gradient: { speed: 0.5 }
  },
  post: {
    brightness: 0.5,
    tint: [1,1,1],
    gamma: 1,
    strobeHz: 0,
    strobeDuty: 0.5,
    strobeLow: 0,
    pitchSpeed: 0,
    yawSpeed: 0,
    pitch: 0,
    yaw: 0
  }
};

const expectedSaved = {
  fpsCap: 30,
  renderMode: 'mirror',
  effect: 'solid',
  effects: { solid: { r: 1, g: 0, b: 0 } },
  post: sampleParams.post
};

test('save and load preset', async () => {
  await savePreset('test', sampleParams);
  const loaded = await loadPreset('test');
  assert.deepEqual(loaded, expectedSaved);
  const list = await listPresets();
  assert(list.includes('test'));
  await unlink(presetPath);
});

test('load preset overrides only specified keys', async () => {
  const partialPreset = {
    fpsCap: 10,
    post: { brightness: 0.25 },
    effects: { solid: { g: 0.5 } }
  };
  await writeFile(presetPath, JSON.stringify(partialPreset, null, 2), 'utf8');
  const target = {
    fpsCap: 60,
    renderMode: 'duplicate',
    effect: 'solid',
    effects: { solid: { r: 1, g: 0, b: 0 } },
    post: { ...sampleParams.post }
  };
  await loadPreset('test', target);
  assert.equal(target.fpsCap, 10);
  assert.equal(target.renderMode, 'duplicate');
  assert.equal(target.effects.solid.g, 0.5);
  assert.equal(target.effects.solid.r, 1);
  assert.equal(target.post.brightness, 0.25);
  assert.equal(target.post.gamma, sampleParams.post.gamma);
  await unlink(presetPath);
});

test('save preset with image', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4//8/AwAI/AL+XJ/kAAAAAElFTkSuQmCC',
    'base64'
  );
  await savePreset('test-image', sampleParams, png);
  const stats = await stat(presetImg);
  assert(stats.size > 0);
  await unlink(presetImg);
  await unlink(presetImgJson);
});
