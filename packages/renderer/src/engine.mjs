// src/engine.mjs
import fs from "fs/promises";
import path from "path";
import url from "url";

import { effects } from "./effects/index.mjs";
import { sliceSection } from "./effects/modifiers.mjs";
import { postPipeline, registerPostModifier } from "./effects/post.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "config");

export { registerPostModifier };

export const SCENE_W = 512, SCENE_H = 128; // virtual canvas per side

// ------- params (shared to UI) -------
export const params = {
  fpsCap: 60,
  effect: "gradient",        // "gradient" | "solid" | "fire"
  wallMode: "duplicate",     // "duplicate" | "independent" | "extend"
  effects: {},
  post: {
    brightness: 0.8,
    tint: [1.0, 1.0, 1.0],
    gamma: 1.0,
    strobeHz: 0.0,
    strobeDuty: 0.5,
    strobeLow: 0.0,
    rollPx: 0,
  }
};

for (const eff of Object.values(effects)) {
  params.effects[eff.id] = { ...(eff.defaultParams || {}) };
}

// ------- load layouts -------
export async function loadLayout(name){
  const raw = await fs.readFile(path.join(CONFIG_DIR, `${name}.json`), "utf8");
  const j = JSON.parse(raw);
  if (!j?.sampling?.width || !j?.sampling?.height) throw new Error(`${name}.json missing sampling.width/height`);
  return j;
}
export const layoutLeft  = await loadLayout("left");
export const layoutRight = await loadLayout("right");

const postKeys = new Set(Object.keys(params.post));
const effectParamMap = {};
for (const eff of Object.values(effects)) {
  for (const key of Object.keys(eff.defaultParams || {})) {
    effectParamMap[key] = eff.id;
  }
}

export function updateParams(patch){
  for (const [key, value] of Object.entries(patch)) {
    if (key === "fpsCap" || key === "effect" || key === "wallMode") {
      params[key] = value;
    } else if (postKeys.has(key)) {
      params.post[key] = value;
    } else if (effectParamMap[key]) {
      const id = effectParamMap[key];
      params.effects[id] = params.effects[id] || {};
      params.effects[id][key] = value;
    } else {
      params[key] = value;
    }
  }
}

// ------- engine buffers -------
const leftF  = new Float32Array(SCENE_W*SCENE_H*3);
const rightF = new Float32Array(SCENE_W*SCENE_H*3);
const bothF  = new Float32Array(SCENE_W*SCENE_H*3*2);

// ------- scene render -------
function renderSceneForSide(side, t){
  const target = side==="left" ? leftF : rightF;

  // Stage A
  const effect = effects[params.effect] || effects["gradient"];
  const effectParams = params.effects[effect.id] || {};
  effect.render(target, SCENE_W, SCENE_H, t, effectParams, side);

  // Stage B
  const post = params.post;
  for (const fn of postPipeline) {
    fn(target, t, post, SCENE_W, SCENE_H);
  }
}

function renderSceneExtended(t){
  const effect = effects[params.effect] || effects["gradient"];
  const effectParams = params.effects[effect.id] || {};
  effect.render(bothF, SCENE_W*2, SCENE_H, t, effectParams, "both");
  const post = params.post;
  for (const fn of postPipeline) {
    fn(bothF, t, post, SCENE_W*2, SCENE_H);
  }
  const half = SCENE_W*SCENE_H*3;
  leftF.set(bothF.subarray(0, half));
  rightF.set(bothF.subarray(half));
}

// ------- build slices frame -------
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
      [layoutLeft.side]:  sideSlices(leftF,  layoutLeft),
      [layoutRight.side]: sideSlices(rightF, layoutRight)
    }
  };
}

// ------- main loop -------
let last = process.hrtime.bigint();
let acc = 0;
let frame = 0;

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

    // Stage A+B for left/right
    if (params.wallMode === "extend") {
      renderSceneExtended(t);
    } else {
      renderSceneForSide("left", t);
      if (params.wallMode === "duplicate") rightF.set(leftF);
      else renderSceneForSide("right", t);
    }

    // Emit SLICES_NDJSON to stdout
    const out = buildSlicesFrame(frame++, cap);
    process.stdout.write(JSON.stringify(out) + "\n");
  }

  setImmediate(tick);
}

// Only tick if we are running as the main process to prevent output swamping tests
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  tick();
}
