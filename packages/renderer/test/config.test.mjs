import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const CONFIG_DIR = new URL('../config/', import.meta.url);

async function loadConfigs(){
  const entries = await readdir(CONFIG_DIR);
  const configs = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const data = await readFile(new URL(name, CONFIG_DIR), 'utf8');
    configs.push({ name, json: JSON.parse(data) });
  }
  return configs;
}

test('config LED counts are consistent', async () => {
  const configs = await loadConfigs();
  for (const { name, json } of configs) {
    const runTotal = json.runs.reduce((sum, run) => sum + run.led_count, 0);
    assert.equal(
      runTotal,
      json.total_leds,
      `${name} total_leds mismatch`
    );
    for (const run of json.runs) {
      const sectionTotal = run.sections.reduce((sum, s) => sum + s.led_count, 0);
      assert.equal(
        sectionTotal,
        run.led_count,
        `${name} run ${run.run_index} led_count mismatch`
      );
    }
  }
});

test('sections stay within normalized sampling space', async () => {
  const configs = await loadConfigs();
  for (const { name, json } of configs) {
    assert.equal(json.sampling.space, 'normalized');
    const { width, height } = json.sampling;
    for (const run of json.runs) {
      for (const sec of run.sections) {
        assert(sec.y >= 0 && sec.y <= height,
          `${name} section ${sec.id} y ${sec.y} out of range`);
        // Sections can be normal (x0 <= x1) or reversed (x0 > x1) for physical wiring
        // Both x0 and x1 must be within the sampling space bounds
        const xMin = Math.min(sec.x0, sec.x1);
        const xMax = Math.max(sec.x0, sec.x1);
        assert(
          xMin >= 0 && xMax <= width,
          `${name} section ${sec.id} x-range [${sec.x0}, ${sec.x1}] out of bounds [0, ${width}]`
        );
      }
    }
  }
});
