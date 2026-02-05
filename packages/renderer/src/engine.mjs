// src/engine.mjs
import fs from "fs/promises";
import path from "path";
import url from "url";

import { effects } from "./effects/index.mjs";
import { setLayoutData as setSectionHighlighterLayouts } from "./effects/library/sectionHighlighter.mjs";
import { sliceSection } from "./effects/modifiers.mjs";
import { renderFrames, SCENE_W, SCENE_H } from "./render-scene.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let CONFIG_DIR;
let layoutLeft, layoutRight;

export { SCENE_W, SCENE_H };

// ------- params (shared to UI) -------
export const params = {
  fpsCap: 60,
  effect: "gradient",        // "gradient" | "solid" | "noise"
  renderMode: "duplicate",    // "duplicate" | "extended" | "mirror"
  effects: {},
  post: {
    brightness: 0.8,
    tint: [1.0, 1.0, 1.0],
    gamma: 1.0,
    strobeHz: 0.0,
    strobeDuty: 0.5,
    strobeLow: 0.0,
    pitchSpeed: 0,
    yawSpeed: 0,
    pitch: 0,
    yaw: 0,
  }
};

for (const eff of Object.values(effects)) {
  params.effects[eff.id] = { ...(eff.defaultParams || {}) };
}

// ------- load layouts -------
async function loadLayout(name){
  const raw = await fs.readFile(path.join(CONFIG_DIR, `${name}.json`), "utf8");
  const j = JSON.parse(raw);
  if (!j?.sampling?.width || !j?.sampling?.height) throw new Error(`${name}.json missing sampling.width/height`);
  return j;
}

export function getLayoutLeft() { return layoutLeft; }
export function getLayoutRight() { return layoutRight; }
export function getConfigDir() { return CONFIG_DIR; }

// Update a section's position in-memory
export function updateSectionPosition(side, sectionId, updates) {
  const layout = side === 'left' ? layoutLeft : layoutRight;
  if (!layout) return null;

  for (const run of layout.runs) {
    const section = run.sections.find(sec => sec.id === sectionId);
    if (section) {
      if ('x0' in updates) section.x0 = updates.x0;
      if ('x1' in updates) section.x1 = updates.x1;
      if ('y' in updates) section.y = updates.y;
      if ('led_count' in updates) section.led_count = updates.led_count;
      // Update section highlighter with new layout data
      setSectionHighlighterLayouts(layoutLeft, layoutRight);
      return layout;
    }
  }
  return null;
}

// Save layout to file
export async function saveLayout(side) {
  const layout = side === 'left' ? layoutLeft : layoutRight;
  if (!layout) throw new Error(`No layout for side: ${side}`);

  const filePath = path.join(CONFIG_DIR, `${side}.json`);
  await fs.writeFile(filePath, JSON.stringify(layout, null, 2), 'utf8');
}

const postKeys = new Set(Object.keys(params.post));
// Map parameter keys to their owning effect when unique
const effectParamMap = {};
const effectParamCounts = {};
for (const eff of Object.values(effects)) {
  for (const key of Object.keys(eff.defaultParams || {})) {
    effectParamCounts[key] = (effectParamCounts[key] || 0) + 1;
    if (!effectParamMap[key]) effectParamMap[key] = eff.id;
  }
}
for (const [key, count] of Object.entries(effectParamCounts)) {
  if (count > 1) effectParamMap[key] = null;
}

export function updateParams(patch){
  for (const [key, value] of Object.entries(patch)) {
    if (key === "fpsCap" || key === "effect" || key === "renderMode") {
      params[key] = value;
    } else if (postKeys.has(key)) {
      params.post[key] = value;
    } else if (effectParamMap[key]) {
      const id = effectParamMap[key];
      params.effects[id] = params.effects[id] || {};
      params.effects[id][key] = value;
    } else if (params.effects[params.effect] && Object.prototype.hasOwnProperty.call(params.effects[params.effect], key)) {
      // Ambiguous parameter name, apply to current effect
      params.effects[params.effect][key] = value;
    } else {
      params[key] = value;
    }
  }
}

// ------- engine buffers -------
// leftFrame and rightFrame hold RGB float data for each wall
const leftFrame  = new Float32Array(SCENE_W * SCENE_H * 3);
const rightFrame = new Float32Array(SCENE_W * SCENE_H * 3);


// ------- build slices frame -------
// Convert the raw float frames into NDJSON ready pixel data
function buildSlicesFrame(frame, fps){
  function sideSlices(sceneF32, layout){
    const out = {};
    layout.runs.forEach(run => {
      run.sections.forEach(sec => {
        const bytes = sliceSection(sceneF32, SCENE_W, SCENE_H, sec, layout.sampling);
        out[sec.id] = { length: sec.led_count, rgb_b64: Buffer.from(bytes).toString("base64") };
      });
    });
    return out;
  }
  return {
    ts: Math.floor(Date.now()/1000),
    frame, fps,
    format: "rgb8",
    sides: {
      [layoutLeft.side]:  sideSlices(leftFrame,  layoutLeft),
      [layoutRight.side]: sideSlices(rightFrame, layoutRight)
    }
  };
}

// ------- main loop -------
let last, acc, frame;

// tick: regulate frame rate, render, and emit LED data
function tick(){
  const now = process.hrtime.bigint();
  const dt  = Number(now - last)/1e9;
  last = now;

  const cap = Math.max(1, params.fpsCap);
  const step = 1.0 / cap;
  acc += dt;

  // throttle to fpsCap
  if (acc >= step) {
    const t = Number(now)/1e9;
    acc = 0;
    renderFrames(leftFrame, rightFrame, params, t);

    // Emit SLICES_NDJSON to stdout
    const out = buildSlicesFrame(frame++, cap);
    process.stdout.write(JSON.stringify(out) + "\n");
  }

  setImmediate(tick);
}

// start: initialize counters and kick off the main loop
export async function start(configDir){
  if (!configDir) {
    throw new Error('configDir is required');
  }
  CONFIG_DIR = path.resolve(ROOT, configDir);

  // Load layouts at startup
  layoutLeft = await loadLayout("left");
  layoutRight = await loadLayout("right");

  // Provide layout data to section highlighter effect
  setSectionHighlighterLayouts(layoutLeft, layoutRight);

  last = process.hrtime.bigint();
  acc = 0;
  frame = 0;
  tick();
}
