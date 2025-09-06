import test from 'node:test';
import assert from 'assert/strict';
import { colorStopsWidget } from '../src/ui/subviews/colorStops.mjs';

class MockGrapick {
  constructor(){
    this.handlers = [];
    this.events = {};
    MockGrapick.last = this;
  }
  addHandler(position, color){
    const handler = { position, color };
    this.handlers.push(handler);
    return handler;
  }
  getHandlers(){ return this.handlers; }
  on(name, fn){ this.events[name] = fn; }
}

test('colorStopsWidget sends updated stops on color change', () => {
  const created = [];
  const document = {
    createElement(tag){
      const el = { tagName: tag.toUpperCase(), style: {}, children: [], appendChild(child){ this.children.push(child); } };
      created.push(el);
      return el;
    }
  };
  globalThis.document = document;
  globalThis.window = { Grapick: MockGrapick };

  const values = { stops: [ { pos: 0, color: [0, 0, 1] } ] };
  const patches = [];
  colorStopsWidget('stops', {}, values, patch => patches.push(patch));

  const gp = MockGrapick.last;
  gp.handlers[0].color = '#00ff00';
  gp.events['handler:color:change'](gp.handlers[0], 1);

  assert.equal(patches.length, 1);
  assert.deepEqual(patches[0].stops, [ { pos: 0, color: [0, 1, 0] } ]);

  delete globalThis.window;
  delete globalThis.document;
});
