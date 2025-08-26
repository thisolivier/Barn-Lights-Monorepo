import test from 'node:test';
import assert from 'node:assert/strict';
import { savePreset, loadPreset, listPresets } from '../src/config-store.mjs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const presetPath = path.resolve(__dirname, '../config/presets/test.json');

const sampleParams = {
  fpsCap: 30,
  effect: 'solid',
  effects: { solid: { r: 1, g: 0, b: 0 } },
  post: {
    brightness: 0.5,
    tint: [1,1,1],
    gamma: 1,
    strobeHz: 0,
    strobeDuty: 0.5,
    strobeLow: 0,
    pitchSpeed: 0,
    yawSpeed: 0
  }
};

test('save and load preset', async () => {
  await savePreset('test', sampleParams);
  const loaded = await loadPreset('test');
  assert.deepEqual(loaded, sampleParams);
  const list = await listPresets();
  assert(list.includes('test'));
  await unlink(presetPath);
});
