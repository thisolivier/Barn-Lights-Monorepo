import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLayout } from '../src/config/load-layout.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('loads valid layout files', () => {
  const layoutPath = path.join(__dirname, '..', '..', '..', 'config', 'left.json');
  const layout = loadLayout(layoutPath);
  // primary keys
  assert.strictEqual(typeof layout.side, 'string');
  assert.strictEqual(typeof layout.total_leds, 'number');
  assert.strictEqual(typeof layout.port_base, 'number');
  assert.strictEqual(typeof layout.gateway_telemetry_port, 'number');
  assert.ok(Array.isArray(layout.static_ip));
  assert.ok(layout.static_ip.every((octet) => typeof octet === 'number'));
  assert.ok(Array.isArray(layout.static_netmask));
  assert.ok(layout.static_netmask.every((octet) => typeof octet === 'number'));
  assert.ok(Array.isArray(layout.static_gateway));
  assert.ok(layout.static_gateway.every((octet) => typeof octet === 'number'));
  assert.ok(Array.isArray(layout.runs));
  assert.strictEqual(typeof layout.sampling, 'object');

  for (const run of layout.runs) {
    assert.strictEqual(typeof run.run_index, 'number');
    assert.strictEqual(typeof run.led_count, 'number');
    assert.ok(Array.isArray(run.sections));
    for (const section of run.sections) {
      assert.strictEqual(typeof section.id, 'string');
      assert.strictEqual(typeof section.led_count, 'number');
      assert.strictEqual(typeof section.y, 'number');
      assert.strictEqual(typeof section.x0, 'number');
      assert.strictEqual(typeof section.x1, 'number');
    }
  }

  const sampling = layout.sampling;
  assert.deepStrictEqual(Object.keys(sampling).sort(), ['height', 'space', 'width']);
  assert.strictEqual(typeof sampling.space, 'string');
  assert.strictEqual(typeof sampling.width, 'number');
  assert.strictEqual(typeof sampling.height, 'number');
});

test('throws when port_base is missing', () => {
  const layoutPath = path.join(__dirname, 'fixtures', 'layout_missing_port.json');
  assert.throws(() => loadLayout(layoutPath), /port_base/);
});

test('throws when static_ip is missing', () => {
  const layoutPath = path.join(__dirname, 'fixtures', 'layout_missing_ip.json');
  assert.throws(() => loadLayout(layoutPath), /static_ip/);
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
