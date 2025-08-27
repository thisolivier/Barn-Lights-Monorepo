import { effects } from '../effects/index.mjs';
// Reusable subviews for rendering effect parameter widgets
import { renderControls } from './subviews/index.mjs';
import { rgbToHex } from './subviews/utils.mjs';
import { initSpeedSlider } from './subviews/speedSlider.mjs';
import { refreshPresetDropdown } from './presets.mjs';

// Function used to send parameter patches back to the engine
let sendFn = null;
// Track which effect's controls are currently displayed
let currentEffectId = null;
// Callbacks returned by speed sliders to update their UI position
let updatePitch = null;
let updateYaw = null;

/**
 * Render parameter widgets for the active effect and keep them in sync
 * with the current parameter values.
 */
function renderEffectControls(doc, P){
  const container = doc.getElementById('effectControls');
  if (!container) return;
  const effect = effects[P.effect] || effects['gradient'];
  const schema = effect.paramSchema || {};
  const values = P.effects[effect.id] = P.effects[effect.id] || {};
  if (currentEffectId !== effect.id){
    container.innerHTML = '';
    container.appendChild(renderControls(schema, values, (patch)=> sendFn(patch)));
    currentEffectId = effect.id;
  }
  for (const input of container.querySelectorAll('[data-key]')){
    const key = input.dataset.key;
    const val = values[key];
    if (val === undefined) continue;
    if (input.type === 'checkbox') input.checked = !!val;
    else if (input.type === 'color') input.value = Array.isArray(val) ? rgbToHex(val) : val;
    else {
      if (doc.activeElement !== input) input.value = val;
      const span = input.nextElementSibling;
      if (span && span.tagName === 'SPAN') span.textContent = val;
    }
  }
}

/** Sync the FPS cap slider and label with the parameter state. */
function applyFpsCap(doc, P){
  const fps = doc.getElementById('fpsCap');
  const fpsV = doc.getElementById('fpsCap_v');
  if (fps) {
    fps.value = P.fpsCap;
    if (fpsV) fpsV.textContent = P.fpsCap;
  }
}

/**
 * Update post-processing controls (brightness, strobe, tint, etc.)
 * to reflect the latest parameter values.
 */
function applyPost(doc, P){
  for (const [key,val] of Object.entries(P.post)){
    if (key === 'tint' || key === 'pitch' || key === 'yaw') continue;
    const el = doc.getElementById(key);
    const span = doc.getElementById(key + '_v');
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!val;
    else { el.value = val; if (span) span.textContent = val; }
  }
  ['tintR','tintG','tintB'].forEach((id,i)=>{
    const el = doc.getElementById(id);
    const span = doc.getElementById(id + '_v');
    if (!el) return;
    el.value = P.post.tint[i];
    if (span) span.textContent = P.post.tint[i];
  });
  if (updatePitch) updatePitch(P.post.pitchSpeed || 0);
  if (updateYaw) updateYaw(P.post.yawSpeed || 0);
}

/** Apply the entire parameter state to the UI inputs. */
export function applyUI(doc, P){
  const effect = doc.getElementById('effect');
  if (effect && effect.value !== P.effect) effect.value = P.effect;
  applyFpsCap(doc,P);
  applyPost(doc,P);
  renderEffectControls(doc,P);
}

/**
 * Wire up DOM events so user interactions patch the parameter object
 * and send updates to the engine. Also initializes preset controls
 * and motion sliders.
 */
export function initUI(win, doc, P, send){
  sendFn = send;
  const effect = doc.getElementById('effect');
  if (effect){
    effect.innerHTML = '';
    for (const id of Object.keys(effects)){
      const opt = doc.createElement('option');
      opt.value = id;
      opt.textContent = id;
      effect.appendChild(opt);
    }
    effect.value = P.effect;
    effect.onchange = () => { send({ effect: effect.value }); renderEffectControls(doc,P); };
  }

  const fps = doc.getElementById('fpsCap');
  const fpsV = doc.getElementById('fpsCap_v');
  if (fps) {
    fps.value = P.fpsCap;
    if (fpsV) fpsV.textContent = P.fpsCap;
    fps.oninput = () => {
      const v = parseFloat(fps.value);
      P.fpsCap = v;
      if (fpsV) fpsV.textContent = v;
      send({ fpsCap: v });
    };
  }
  for (const [key,val] of Object.entries(P.post)){
    if (key === 'tint') continue;
    const el = doc.getElementById(key);
    const span = doc.getElementById(key + '_v');
    if (!el) continue;
    if (el.type === 'checkbox'){
      el.checked = !!val;
      el.oninput = () => { P.post[key] = el.checked; send({ [key]: el.checked }); };
    } else {
      el.value = val;
      if (span) span.textContent = val;
      el.oninput = () => { const v = parseFloat(el.value); P.post[key] = v; if (span) span.textContent = v; send({ [key]: v }); };
    }
  }
  ['tintR','tintG','tintB'].forEach((id,i)=>{
    const el = doc.getElementById(id);
    const span = doc.getElementById(id + '_v');
    if (!el) return;
    el.value = P.post.tint[i];
    if (span) span.textContent = P.post.tint[i];
    el.oninput = () => {
      const tint = P.post.tint;
      tint[i] = parseFloat(el.value);
      if (span) span.textContent = el.value;
      send({ tint });
    };
  });

  const pitchEl = doc.getElementById('pitch');
  const pitchDeg = doc.getElementById('pitchDeg');
  if (pitchEl){
    updatePitch = initSpeedSlider(pitchEl, P, send, 'pitchSpeed', 500);
  }

  const yawEl = doc.getElementById('yaw');
  const yawDeg = doc.getElementById('yawDeg');
  if (yawEl){
    updateYaw = initSpeedSlider(yawEl, P, send, 'yawSpeed', Math.PI);
  }

  const updateAngles = () => {
    if (pitchDeg) pitchDeg.value = Math.abs(P.post.pitch || 0).toFixed(1);
    if (yawDeg) yawDeg.value = Math.abs(P.post.yaw || 0).toFixed(1);
    win.requestAnimationFrame(updateAngles);
  };
  updateAngles();

  const presetInput = doc.getElementById('presetName');
  const presetList = doc.getElementById('presetList');
  if (presetList){
    presetList.onchange = () => { if (presetInput) presetInput.value = presetList.value; };
    refreshPresetDropdown(win, doc, presetList);
  }
  const saveBtn = doc.getElementById('savePreset');
  if (saveBtn){
    saveBtn.onclick = async () => {
      const name = presetInput?.value.trim() || presetList?.value;
      if (!name) return;
      await win.fetch(`/preset/save/${encodeURIComponent(name)}`, { method: 'POST' });
      await refreshPresetDropdown(win, doc, presetList);
      if (presetInput) presetInput.value = name;
    };
  }
  const loadBtn = doc.getElementById('loadPreset');
  if (loadBtn){
    loadBtn.onclick = async () => {
      const name = presetInput?.value.trim() || presetList?.value;
      if (!name) return;
      await win.fetch(`/preset/load/${encodeURIComponent(name)}`);
    };
  }

  win.addEventListener('keydown', (e) => {
    if (e.key >= '1' && e.key <= '9'){
      const idx = e.key.charCodeAt(0) - '1'.charCodeAt(0);
      const ids = Object.keys(effects);
      if (idx < ids.length && effect){
        effect.value = ids[idx];
        effect.onchange();
      }
    }
    if (e.key.toLowerCase() === 'b') send({ brightness: 0 });
  });

  applyUI(doc, P);
}
