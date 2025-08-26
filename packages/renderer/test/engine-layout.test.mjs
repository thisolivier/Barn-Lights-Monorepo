import test, { mock } from 'node:test';
import assert from 'assert/strict';
import fs from 'fs/promises';

test('loadLayout rejects missing sampling.width', async (t) => {
  const { loadLayout } = await import('../src/engine.mjs');
  mock.method(fs, 'readFile', async () => {
    return JSON.stringify({ sampling: { height: 1 }, runs: [] });
  });
  t.after(() => mock.restoreAll());

  await assert.rejects(
    loadLayout('foo'),
    /foo\.json missing sampling.width\/height/
  );
});
