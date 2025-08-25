import { initConnection, send } from "./connection.mjs";
import { initUI, applyUI } from "./ui-controls.mjs";
import { frame, toggleFreeze } from "./renderer.mjs";

function setStatus(doc, msg){
  const el = doc.getElementById("status");
  if (el) el.textContent = msg;
}

async function loadLayout(win, doc, side){
  try {
    return await (await win.fetch(`/layout/${side}`)).json();
  } catch (err) {
    console.error(`Failed to load ${side} layout`, err);
    setStatus(doc, `Failed to load ${side} layout`);
    return null;
  }
}

export async function boot(docArg = globalThis.document){
  const doc = docArg;
  const win = docArg.defaultView || globalThis;

  const [layoutLeft, layoutRight] = await Promise.all([
    loadLayout(win, doc, "left"),
    loadLayout(win, doc, "right")
  ]);

  const canvL = doc.getElementById("left");
  const ctxL = canvL.getContext("2d");
  const canvR = doc.getElementById("right");
  const ctxR = canvR.getContext("2d");

  const params = {};

  initConnection(win,
    (m) => {
      Object.assign(params, m.params);
      const sceneW = m.scene.w;
      const sceneH = m.scene.h;
      const leftF  = new Float32Array(sceneW * sceneH * 3);
      const rightF = new Float32Array(sceneW * sceneH * 3);
      initUI(win, doc, params, send, toggleFreeze);
      if (ctxL && ctxR) frame(win, doc, ctxL, ctxR, leftF, rightF, params, layoutLeft, layoutRight, sceneW, sceneH);
      else setStatus(doc, "Preview unavailable");
    },
    (m) => {
      Object.assign(params, m.params);
      applyUI(doc, params);
    },
    (msg) => setStatus(doc, msg)
  );
}
