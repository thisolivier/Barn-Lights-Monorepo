import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshPresetDropdown } from '../src/ui/presets.mjs';

test('preset dropdown matches fetched names', async () => {
  const names = ['one','two'];
  const win = { fetch: async () => ({ json: async () => names }) };
  const doc = {
    createElement(tag){
      return { tag, value: '', textContent: '', appendChild(){}};
    }
  };
  const select = {
    innerHTML: '',
    options: [],
    appendChild(opt){ this.options.push(opt); }
  };
  await refreshPresetDropdown(win, doc, select);
  assert.equal(select.options.length, names.length);
  assert.deepEqual(select.options.map(o => o.value), names);
});
