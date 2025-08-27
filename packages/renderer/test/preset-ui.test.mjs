import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshPresetPanel } from '../src/ui/presets.mjs';

test('preset panel matches fetched names', async () => {
  const names = ['one','two'];
  const win = { fetch: async () => ({ json: async () => names }) };
  const doc = {
    createElement(tag){
      return {
        tag,
        children: [],
        className: '',
        src: '',
        alt: '',
        textContent: '',
        onclick: null,
        appendChild(child){ this.children.push(child); }
      };
    }
  };
  const container = {
    innerHTML: '',
    children: [],
    appendChild(child){ this.children.push(child); }
  };
  await refreshPresetPanel(win, doc, container, ()=>{});
  assert.equal(container.children.length, names.length);
});
