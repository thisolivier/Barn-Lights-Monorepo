import test from 'node:test';
import assert from 'assert/strict';
import { spawn } from 'child_process';
import { once } from 'events';
import { createInterface } from 'readline';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function getFrame(){
  const proc = spawn('node', ['src/engine.mjs'], { cwd: ROOT });
  const rl = createInterface({ input: proc.stdout });
  let jsonLine = null;
  for await (const line of rl) {
    if (line.startsWith('{')) { jsonLine = line; break; }
  }
  proc.kill();
  await once(proc, 'exit');
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
  const leftCfg = JSON.parse(await readFile(new URL('../config/left.json', import.meta.url)));
  const rightCfg = JSON.parse(await readFile(new URL('../config/right.json', import.meta.url)));
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
