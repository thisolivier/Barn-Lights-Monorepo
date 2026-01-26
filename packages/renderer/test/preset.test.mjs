import test from 'node:test';
import assert from 'node:assert/strict';
import { savePreset, loadPreset, listPresets } from '../src/config-store.mjs';
import { unlink, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const presetsDir = path.resolve(__dirname, '../config/presets');

// Generate unique test name for isolation
function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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
  const testName = uniqueName('test');
  const presetPath = path.join(presetsDir, `${testName}.json`);
  try {
    await savePreset(testName, sampleParams);
    const loaded = await loadPreset(testName);
    assert.deepEqual(loaded, expectedSaved);
    const list = await listPresets();
    assert(list.includes(testName));
  } finally {
    await unlink(presetPath).catch(() => {});
  }
});

test('load preset overrides only specified keys', async () => {
  const testName = uniqueName('test');
  const presetPath = path.join(presetsDir, `${testName}.json`);
  try {
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
    await loadPreset(testName, target);
    assert.equal(target.fpsCap, 10);
    assert.equal(target.renderMode, 'duplicate');
    assert.equal(target.effects.solid.g, 0.5);
    assert.equal(target.effects.solid.r, 1);
    assert.equal(target.post.brightness, 0.25);
    assert.equal(target.post.gamma, sampleParams.post.gamma);
  } finally {
    await unlink(presetPath).catch(() => {});
  }
});

test('save preset with image', async () => {
  const testName = uniqueName('test-image');
  const presetImg = path.join(presetsDir, `${testName}.png`);
  const presetJson = path.join(presetsDir, `${testName}.json`);
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4//8/AwAI/AL+XJ/kAAAAAElFTkSuQmCC',
      'base64'
    );
    await savePreset(testName, sampleParams, png);
    const stats = await stat(presetImg);
    assert(stats.size > 0);
  } finally {
    await unlink(presetImg).catch(() => {});
    await unlink(presetJson).catch(() => {});
  }
});

test('saving preset overwrites existing data and images', async () => {
  const testName = uniqueName('overwrite');
  const overwritePath = path.join(presetsDir, `${testName}.json`);
  const overwriteImg = path.join(presetsDir, `${testName}.png`);
  try {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4//8/AwAI/AL+XJ/kAAAAAElFTkSuQmCC',
      'base64'
    );

    await savePreset(testName, sampleParams, png);

    const updatedParams = { ...sampleParams, fpsCap: 45 };
    await savePreset(testName, updatedParams);

    const loaded = await loadPreset(testName);
    assert.equal(loaded.fpsCap, 45);
    await assert.rejects(stat(overwriteImg));
  } finally {
    await unlink(overwritePath).catch(() => {});
    await unlink(overwriteImg).catch(() => {});
  }
});
