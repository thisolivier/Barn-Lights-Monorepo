import test from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { createInterface } from 'readline';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { params, updateParams } from '../src/engine.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function getFrame(){
  const proc = spawn('node', ['bin/engine.mjs', '--config-dir', '../../config'], { cwd: ROOT });
  const rl = createInterface({ input: proc.stdout });
  let jsonLine = null;

  // Wrap readline loop with timeout to prevent indefinite hang
  const readlineTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Readline timeout waiting for JSON frame')), 10000)
  );
  const readFirstLine = (async () => {
    for await (const line of rl) {
      if (line.startsWith('{')) { jsonLine = line; break; }
    }
  })();
  await Promise.race([readFirstLine, readlineTimeout]);

  proc.kill();

  // Add timeout to process exit wait
  const exitTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Process exit timeout')), 5000)
  );
  await Promise.race([once(proc, 'exit'), exitTimeout]);

  return JSON.parse(jsonLine);
}

function collectSections(layout){
  const map = {};
  layout.runs.forEach(run => {
    run.sections.forEach(sec => { map[sec.id] = sec.led_count; });
  });
  return map;
}

test('emits valid JSON structured output', async () => {
  const frame = await getFrame();
  assert.equal(typeof frame.ts, 'number');
  assert.equal(typeof frame.frame, 'number');
  assert.equal(typeof frame.fps, 'number');
  assert.equal(frame.format, 'rgb8');
  assert.ok(frame.sides.left && frame.sides.right);
});

test('output matches configuration section lengths', async () => {
  const frame = await getFrame();
  const leftCfg = JSON.parse(await readFile(new URL('../../../config/left.json', import.meta.url)));
  const rightCfg = JSON.parse(await readFile(new URL('../../../config/right.json', import.meta.url)));
  const leftSections = collectSections(leftCfg);
  const rightSections = collectSections(rightCfg);

  const leftOut = frame.sides[leftCfg.side];
  const rightOut = frame.sides[rightCfg.side];

  assert.deepEqual(Object.keys(leftOut).sort(), Object.keys(leftSections).sort());
  assert.deepEqual(Object.keys(rightOut).sort(), Object.keys(rightSections).sort());

  for (const [id, len] of Object.entries(leftSections)) {
    assert.equal(leftOut[id].length, len);
  }
  for (const [id, len] of Object.entries(rightSections)) {
    assert.equal(rightOut[id].length, len);
  }
});

test('updateParams routes shared keys to active effect', () => {
  // Clone original state to restore after test for isolation
  const originalParams = structuredClone(params);
  try {
    params.effect = 'gradient';
    params.effects.gradient.stops = [
      { pos: 0, color: [0,0,0] },
      { pos: 1, color: [0,0,0] }
    ];
    params.effects.noise.stops = [
      { pos: 0, color: [1,1,1] },
      { pos: 1, color: [1,1,1] }
    ];
    updateParams({ stops: [
      { pos: 0, color: [1,0,0] },
      { pos: 1, color: [0,1,0] }
    ] });
    assert.deepEqual(params.effects.gradient.stops, [
      { pos: 0, color: [1,0,0] },
      { pos: 1, color: [0,1,0] }
    ]);
    assert.deepEqual(params.effects.noise.stops, [
      { pos: 0, color: [1,1,1] },
      { pos: 1, color: [1,1,1] }
    ]);
  } finally {
    // Restore all params keys from clone
    Object.keys(originalParams).forEach(key => {
      params[key] = originalParams[key];
    });
  }
});
