import { initConnection, send } from "./connection.mjs";
import { initUI, applyUI } from "./controls-logic.mjs";
import { frame } from "./renderer.mjs";

function setStatus(doc, msg){
  const el = doc.getElementById("status");
  if (el) el.textContent = msg;
}

async function loadLightLayout(win, doc, side){
  try {
    return await (await win.fetch(`/layout/${side}`)).json();
  } catch (err) {
    console.error(`Failed to load ${side} layout`, err);
    setStatus(doc, `Failed to load ${side} layout`);
    return null;
  }
}

export async function run(docArg = globalThis.document){
  const doc = docArg;
  const win = docArg.defaultView || globalThis;

  const [layoutLeft, layoutRight] = await Promise.all([
    loadLightLayout(win, doc, "left"),
    loadLightLayout(win, doc, "right")
  ]);

  const canvL = doc.getElementById("left");
  const ctxL = canvL.getContext("2d");
  const canvR = doc.getElementById("right");
  const ctxR = canvR.getContext("2d");

  const params = {};

  // Establish a WebSocket connection and describe how incoming messages are used.
  const onInit = (m) => {
    // Store default parameters and allocate buffers for both walls.
    Object.assign(params, m.params);
    const sceneW = m.scene.w;
    const sceneH = m.scene.h;
    const leftFrame  = new Float32Array(sceneW * sceneH * 3);
    const rightFrame = new Float32Array(sceneW * sceneH * 3);
    // Build the UI and start rendering frames if canvases are available.
    initUI(win, doc, params, send);
    if (ctxL && ctxR){
      frame(win, doc, ctxL, ctxR, leftFrame, rightFrame, params, layoutLeft, layoutRight, sceneW, sceneH);
    } else setStatus(doc, "Preview unavailable");
  };
  const onParams = (m) => {
    Object.assign(params, m.params);
    applyUI(doc, params);
  };
  const onStatus = (msg) => setStatus(doc, msg);
  // Delay connection slightly so automated tests waiting for network idle can finish loading assets.
  setTimeout(() => initConnection(win, onInit, onParams, onStatus), 600);
}
