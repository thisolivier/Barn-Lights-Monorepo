const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadLayout } = require('../src/config/layout.ts');

test('loads valid layout files', () => {
  const layoutPath = path.join(__dirname, '..', 'config', 'left.json');
  const layout = loadLayout(layoutPath);
  assert.strictEqual(layout.runs.length, 3);
});

test('throws when section counts do not match run led_count', () => {
  const layoutPath = path.join(__dirname, 'fixtures', 'layout_bad_sections.json');
  assert.throws(() => loadLayout(layoutPath), /does not match sections sum/);
});

test('throws when run_index values are not unique', () => {
  const layoutPath = path.join(__dirname, 'fixtures', 'layout_duplicate_run.json');
  assert.throws(() => loadLayout(layoutPath), /Duplicate run_index/);
});

test('warns when total_leds mismatches run sums', () => {
  const layoutPath = path.join(__dirname, 'fixtures', 'layout_total_mismatch.json');
  const warns = [];
  loadLayout(layoutPath, { warn: (msg) => warns.push(msg) });
  assert.strictEqual(warns.length, 1);
  assert.match(warns[0], /does not equal sum of runs/);
});
