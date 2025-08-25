import {
  genGradient, genSolid, genFire,
  applyBrightnessTint, applyGamma, applyStrobe, applyRollX,
  sliceSection, clamp01
} from "../effects.mjs";

let doc = /** @type {Document} */ (globalThis.document);
let win = /** @type {Window} */ (doc && doc.defaultView ? doc.defaultView : globalThis);

const controls = [
  "fpsCap", "mirrorWalls", "brightness", "gamma", "rollPx",
  "strobeHz", "strobeDuty", "strobeLow", "gradPhase"
];

let ws = null;
let P = null;
let sceneW = 512, sceneH = 128;
let layoutLeft = null, layoutRight = null;
let canvL = null, ctxL = null;
let canvR = null, ctxR = null;

const leftF  = new Float32Array(sceneW * sceneH * 3);
const rightF = new Float32Array(sceneW * sceneH * 3);

let offscreen = null, offCtx = null;
let freeze = false;

function setStatus(docArg, msg){
  const el = docArg.getElementById("status");
  if (el) el.textContent = msg;
}

function send(obj){
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function applyUI(docArg = doc){
  if (!P) return;
  const effect = docArg.getElementById("effect");
  if (effect && effect.value !== P.effect) effect.value = P.effect;
  for (const k of controls) {
    const el = docArg.getElementById(k);
    const span = docArg.getElementById(k + "_v");
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!P[k];
    else { el.value = P[k]; if (span) span.textContent = P[k]; }
  }
  ["tintR","tintG","tintB"].forEach((id,i)=>{
    const el = docArg.getElementById(id);
    const span = docArg.getElementById(id + "_v");
    if (!el) return;
    el.value = P.tint[i];
    if (span) span.textContent = P.tint[i];
  });
}

export function initUI(docArg = doc){
  // effect select
  const effect = docArg.getElementById("effect");
  effect.value = P.effect;
  effect.onchange = () => send({ effect: effect.value });

  // ranges/checkboxes
  for (const k of controls) {
    const el = docArg.getElementById(k);
    const span = docArg.getElementById(k + "_v");
    if (!el) continue;
    if (el.type === "checkbox") {
      el.checked = !!P[k];
      el.oninput = () => send({ [k]: el.checked });
    } else {
      el.value = P[k];
      if (span) span.textContent = P[k];
      el.oninput = () => {
        if (span) span.textContent = el.value;
        send({ [k]: parseFloat(el.value) });
      };
    }
  }

  // tint sliders
  ["tintR","tintG","tintB"].forEach((id, i) => {
    const el = docArg.getElementById(id);
    const span = docArg.getElementById(id + "_v");
    el.value = P.tint[i];
    if (span) span.textContent = P.tint[i];
    el.oninput = () => {
      P.tint[i] = parseFloat(el.value);
      if (span) span.textContent = el.value;
      send({ tint: P.tint });
    };
  });

  // hotkeys
  win.addEventListener("keydown", (e) => {
    if (e.key === "1") effect.value = "gradient", effect.onchange();
    if (e.key === "2") effect.value = "solid", effect.onchange();
    if (e.key === "3") effect.value = "fire", effect.onchange();
    if (e.key.toLowerCase() === "b") send({ brightness: 0 });
    if (e.key === " ") freeze = !freeze;
  });

  applyUI(docArg);
  if (layoutLeft && layoutRight) startPreview();
  else setStatus(docArg, "Preview unavailable");
}

export function renderScene(target, side, t){
  switch (P.effect) {
    case "solid": genSolid(target, sceneW, sceneH, t, P, side); break;
    case "fire":  genFire(target,  sceneW, sceneH, t, P);      break;
    default:      genGradient(target, sceneW, sceneH, t, P);    break;
  }
  applyStrobe(target, t, P.strobeHz, P.strobeDuty, P.strobeLow);
  applyBrightnessTint(target, P.tint, P.brightness);
  applyGamma(target, P.gamma);
  applyRollX(target, sceneW, sceneH, P.rollPx);
}

export function drawScene(ctx, sceneF32, docArg = doc){
  if (!offscreen || offscreen.width !== sceneW || offscreen.height !== sceneH) {
    if (win.OffscreenCanvas) {
      offscreen = new win.OffscreenCanvas(sceneW, sceneH);
    } else {
      offscreen = docArg.createElement("canvas");
      offscreen.width = sceneW;
      offscreen.height = sceneH;
    }
    offCtx = offscreen.getContext("2d");
  }
  const img = offCtx.createImageData(sceneW, sceneH);
  for (let i = 0, j = 0; i < sceneF32.length; i += 3, j += 4){
    img.data[j]   = Math.round(clamp01(sceneF32[i]) * 255);
    img.data[j+1] = Math.round(clamp01(sceneF32[i+1]) * 255);
    img.data[j+2] = Math.round(clamp01(sceneF32[i+2]) * 255);
    img.data[j+3] = 255;
  }
  offCtx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
  ctx.drawImage(offscreen, 0, 0, ctx.canvas.width, ctx.canvas.height);
}

function drawSections(ctx, sceneF32, layout){
  const Wc = ctx.canvas.width, Hc = ctx.canvas.height;
  ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,0.6)";
  layout.runs.forEach(run => {
    run.sections.forEach(sec => {
      const y = sec.y * Hc;
      const x0 = (sec.x0 / layout.sampling.width) * Wc;
      const x1 = (sec.x1 / layout.sampling.width) * Wc;

      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();

      const bytes = sliceSection(sceneF32, sceneW, sceneH, sec, layout.sampling);
      for (let i = 0; i < sec.led_count; i++){
        const t = sec.led_count > 1 ? i / (sec.led_count - 1) : 0;
        const x = x0 + (x1 - x0) * t;
        const j = i * 3;
        ctx.fillStyle = `rgb(${bytes[j]},${bytes[j+1]},${bytes[j+2]})`;
        ctx.fillRect(x-1, y-1, 2, 2);
      }
    });
  });
}

function frame(){
  const t = freeze ? 0 : win.performance.now() / 1000;
  renderScene(leftF,  "left",  t);
  if (P.mirrorWalls) rightF.set(leftF); else renderScene(rightF, "right", t);
  drawScene(ctxL, leftF);
  if (layoutLeft)  drawSections(ctxL, leftF, layoutLeft);
  drawScene(ctxR, rightF);
  if (layoutRight) drawSections(ctxR, rightF, layoutRight);
  win.requestAnimationFrame(frame);
}

export function startPreview(){
  win.requestAnimationFrame(frame);
}

export async function boot(docArg = globalThis.document){
  doc = docArg;
  win = docArg.defaultView || globalThis;

  try {
    ws = new win.WebSocket(`ws://${win.location.host}`);
    ws.onerror = (ev)=>{ console.error("WebSocket error", ev); setStatus(doc, "WebSocket connection error"); };
    ws.onclose = (ev)=>{ console.warn("WebSocket closed", ev); setStatus(doc, "WebSocket connection closed"); };
    ws.onmessage = (ev)=> {
      const m = JSON.parse(ev.data);
      if (m.type === "init") { P = m.params; sceneW = m.scene.w; sceneH = m.scene.h; initUI(doc); }
      if (m.type === "params") { P = m.params; applyUI(doc); }
    };
  } catch (err) {
    console.error("Failed to create WebSocket", err);
    setStatus(doc, "Failed to connect to server");
  }

  try {
    layoutLeft = await (await win.fetch("/layout/left")).json();
  } catch (err) {
    console.error("Failed to load left layout", err);
    setStatus(doc, "Failed to load left layout");
  }
  try {
    layoutRight = await (await win.fetch("/layout/right")).json();
  } catch (err) {
    console.error("Failed to load right layout", err);
    setStatus(doc, "Failed to load right layout");
  }

  canvL = doc.getElementById("left");
  ctxL = canvL.getContext("2d");
  canvR = doc.getElementById("right");
  ctxR = canvR.getContext("2d");
}

export { P, sceneW, sceneH, layoutLeft, layoutRight };

