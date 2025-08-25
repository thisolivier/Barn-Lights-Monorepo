// src/engine.mjs
import { readFile } from "fs/promises";
import path from "path";
import url from "url";

import { effects } from "./effects/index.mjs";
import {
  applyBrightnessTint, applyGamma, applyStrobe, applyRollX,
  sliceSection, clamp01
} from "./effects/modifiers.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONFIG_DIR = path.join(ROOT, "config");

export const SCENE_W = 512, SCENE_H = 128; // virtual canvas per side

// ------- params (shared to UI) -------
export const params = {
  fpsCap: 60,
  effect: "gradient",        // "gradient" | "solid" | "fire"
  mirrorWalls: true,

  // gradient
  gradStart: [0.0, 0.0, 1.0],
  gradEnd:   [1.0, 0.0, 0.0],
  gradPhase: 0.0,

  // solid
  solidLeft:  [0.0, 1.0, 0.0],
  solidRight: [1.0, 1.0, 1.0],

  // fire
  fireSpeed: 0.35,
  fireScale: 2.2,
  fireIntensity: 1.2,

  // post
  brightness: 0.8,
  tint: [1.0, 1.0, 1.0],
  gamma: 1.0,
  strobeHz: 0.0,
  strobeDuty: 0.5,
  strobeLow: 0.0,
  rollPx: 0
};

// ------- load layouts -------
async function loadLayout(name){
  const raw = await readFile(path.join(CONFIG_DIR, `${name}.json`), "utf8");
  const j = JSON.parse(raw);
  if (!j?.sampling?.width || !j?.sampling?.height) throw new Error(`${name}.json missing sampling.width/height`);
  return j;
}
export const layoutLeft  = await loadLayout("left");
export const layoutRight = await loadLayout("right");

export function updateParams(patch){
  Object.assign(params, patch);
}

// ------- engine buffers -------
const leftF  = new Float32Array(SCENE_W*SCENE_H*3);
const rightF = new Float32Array(SCENE_W*SCENE_H*3);

// ------- scene render -------
function renderSceneForSide(side, t){
  const target = side==="left" ? leftF : rightF;

  // Stage A
  const effect = effects[params.effect] || effects["gradient"];
  effect.render(target, SCENE_W, SCENE_H, t, params, side);

  // Stage B
  applyStrobe(target, t, params.strobeHz, params.strobeDuty, params.strobeLow);
  applyBrightnessTint(target, params.tint, params.brightness);
  applyGamma(target, params.gamma);
  applyRollX(target, SCENE_W, SCENE_H, params.rollPx);
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
    renderSceneForSide("left", t);
    if (params.mirrorWalls) rightF.set(leftF);
    else renderSceneForSide("right", t);

    // Emit SLICES_NDJSON to stdout
    const out = buildSlicesFrame(frame++, cap);
    process.stdout.write(JSON.stringify(out) + "\n");
  }

  setImmediate(tick);
}
tick();
