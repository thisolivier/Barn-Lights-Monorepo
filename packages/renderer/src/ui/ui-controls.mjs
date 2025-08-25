const controls = [
  "fpsCap", "mirrorWalls", "brightness", "gamma", "rollPx",
  "strobeHz", "strobeDuty", "strobeLow", "gradPhase"
];

export function applyUI(doc, P){
  const effect = doc.getElementById("effect");
  if (effect && effect.value !== P.effect) effect.value = P.effect;
  for (const k of controls){
    const el = doc.getElementById(k);
    const span = doc.getElementById(k + "_v");
    if (!el) continue;
    if (el.type === "checkbox") el.checked = !!P[k];
    else { el.value = P[k]; if (span) span.textContent = P[k]; }
  }
  ["tintR","tintG","tintB"].forEach((id,i)=>{
    const el = doc.getElementById(id);
    const span = doc.getElementById(id + "_v");
    if (!el) return;
    el.value = P.tint[i];
    if (span) span.textContent = P.tint[i];
  });
}

export function initUI(win, doc, P, send, onToggleFreeze){
  const effect = doc.getElementById("effect");
  effect.value = P.effect;
  effect.onchange = () => send({ effect: effect.value });

  for (const k of controls){
    const el = doc.getElementById(k);
    const span = doc.getElementById(k + "_v");
    if (!el) continue;
    if (el.type === "checkbox"){
      el.checked = !!P[k];
      el.oninput = () => send({ [k]: el.checked });
    } else {
      el.value = P[k];
      if (span) span.textContent = P[k];
      el.oninput = () => { if (span) span.textContent = el.value; send({ [k]: parseFloat(el.value) }); };
    }
  }

  ["tintR","tintG","tintB"].forEach((id,i)=>{
    const el = doc.getElementById(id);
    const span = doc.getElementById(id + "_v");
    el.value = P.tint[i];
    if (span) span.textContent = P.tint[i];
    el.oninput = () => {
      P.tint[i] = parseFloat(el.value);
      if (span) span.textContent = el.value;
      send({ tint: P.tint });
    };
  });

  win.addEventListener("keydown", (e) => {
    if (e.key === "1") effect.value = "gradient", effect.onchange();
    if (e.key === "2") effect.value = "solid", effect.onchange();
    if (e.key === "3") effect.value = "fire", effect.onchange();
    if (e.key.toLowerCase() === "b") send({ brightness: 0 });
    if (e.key === " ") onToggleFreeze();
  });

  applyUI(doc, P);
}
