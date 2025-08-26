import { effects } from '../effects/index.mjs';
import { renderControls } from './controls/index.mjs';
import { rgbToHex } from './controls/utils.mjs';

let sendFn = null;
let currentEffectId = null;

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

function applyTop(doc, P){
  const fps = doc.getElementById('fpsCap');
  const fpsV = doc.getElementById('fpsCap_v');
  if (fps){ fps.value = P.fpsCap; if (fpsV) fpsV.textContent = P.fpsCap; }
  const mirror = doc.getElementById('mirrorWalls');
  if (mirror) mirror.checked = !!P.mirrorWalls;
}

function applyPost(doc, P){
  for (const [key,val] of Object.entries(P.post)){
    if (key === 'tint') continue;
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
}

export function applyUI(doc, P){
  const effect = doc.getElementById('effect');
  if (effect && effect.value !== P.effect) effect.value = P.effect;
  applyTop(doc,P);
  applyPost(doc,P);
  renderEffectControls(doc,P);
}

export function initUI(win, doc, P, send, onToggleFreeze){
  sendFn = send;
  const effect = doc.getElementById('effect');
  effect.value = P.effect;
  effect.onchange = () => { send({ effect: effect.value }); renderEffectControls(doc,P); };

  const fps = doc.getElementById('fpsCap');
  const fpsV = doc.getElementById('fpsCap_v');
  if (fps){
    fps.value = P.fpsCap;
    if (fpsV) fpsV.textContent = P.fpsCap;
    fps.oninput = () => { const v = parseFloat(fps.value); P.fpsCap = v; if (fpsV) fpsV.textContent = v; send({ fpsCap: v }); };
  }
  const mirror = doc.getElementById('mirrorWalls');
  if (mirror){
    mirror.checked = !!P.mirrorWalls;
    mirror.oninput = () => { P.mirrorWalls = mirror.checked; send({ mirrorWalls: mirror.checked }); };
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

  win.addEventListener('keydown', (e) => {
    if (e.key === '1') effect.value = 'gradient', effect.onchange();
    if (e.key === '2') effect.value = 'solid', effect.onchange();
    if (e.key === '3') effect.value = 'fire', effect.onchange();
    if (e.key.toLowerCase() === 'b') send({ brightness: 0 });
    if (e.key === ' ') onToggleFreeze();
  });

  applyUI(doc, P);
}
