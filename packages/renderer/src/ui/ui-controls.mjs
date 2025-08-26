const controls = [
  "fpsCap", "mirrorWalls", "brightness", "gamma", "rollPx",
  "strobeHz", "strobeDuty", "strobeLow", "gradPhase"
];

function paramSource(P, key){
  if (key === "fpsCap" || key === "mirrorWalls") return P;
  if (key === "gradPhase") return P.effects.gradient;
  return P.post;
}

export function applyUI(doc, P){
  const effect = doc.getElementById("effect");
  if (effect && effect.value !== P.effect) effect.value = P.effect;
  for (const k of controls){
    const el = doc.getElementById(k);
    const span = doc.getElementById(k + "_v");
    const src = paramSource(P, k);
    if (!el || !src) continue;
    const val = src[k];
    if (el.type === "checkbox") el.checked = !!val;
    else { el.value = val; if (span) span.textContent = val; }
  }
  ["tintR","tintG","tintB"].forEach((id,i)=>{
    const el = doc.getElementById(id);
    const span = doc.getElementById(id + "_v");
    if (!el) return;
    el.value = P.post.tint[i];
    if (span) span.textContent = P.post.tint[i];
  });
}

export function initUI(win, doc, P, send, onToggleFreeze){
  const effect = doc.getElementById("effect");
  effect.value = P.effect;
  effect.onchange = () => send({ effect: effect.value });

  for (const k of controls){
    const el = doc.getElementById(k);
    const span = doc.getElementById(k + "_v");
    const src = paramSource(P, k);
    if (!el || !src) continue;
    if (el.type === "checkbox"){
      el.checked = !!src[k];
      el.oninput = () => { const s = paramSource(P, k); if(s){ s[k] = el.checked; } send({ [k]: el.checked }); };
    } else {
      el.value = src[k];
      if (span) span.textContent = src[k];
      el.oninput = () => {
        const v = parseFloat(el.value);
        const s = paramSource(P, k); if(s){ s[k] = v; }
        if (span) span.textContent = v;
        send({ [k]: v });
      };
    }
  }

  ["tintR","tintG","tintB"].forEach((id,i)=>{
    const el = doc.getElementById(id);
    const span = doc.getElementById(id + "_v");
    el.value = P.post.tint[i];
    if (span) span.textContent = P.post.tint[i];
    el.oninput = () => {
      const tint = P.post.tint;
      tint[i] = parseFloat(el.value);
      if (span) span.textContent = el.value;
      send({ tint });
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
