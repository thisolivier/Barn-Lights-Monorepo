// Layout fetching and runtime handlers for the UI.

function setStatus(doc, msg){
  const el = doc.getElementById("status");
  if (el) el.textContent = msg;
}

const layoutCache = {};

async function loadLightLayout(win, doc, side){
  if (layoutCache[side]) return layoutCache[side];
  console.log(`Fetching ${side} layout`);
  const promise = win.fetch(`/layout/${side}`)
    .then(response => response.json())
    .then(layout => {
      console.log(`Fetched ${side} layout`);
      return layout;
    })
    .catch(err => {
      console.error(`Failed to load ${side} layout`, err);
      setStatus(doc, `Failed to load ${side} layout`);
      return null;
    });
  layoutCache[side] = promise;
  return promise;
}

export async function run(applyLocal, setSceneInfo, docArg = globalThis.document){
  const doc = docArg;
  const win = docArg.defaultView || globalThis;

  const [layoutLeft, layoutRight] = await Promise.all([
    loadLightLayout(win, doc, "left"),
    loadLightLayout(win, doc, "right")
  ]);

  const onInit = (msg) => {
    applyLocal(msg.params);
    setSceneInfo({ width: msg.scene.w, height: msg.scene.h });
  };

  const onParams = (msg) => {
    applyLocal(msg.params);
  };

  const onStatus = (statusMessage) => setStatus(doc, statusMessage);
  console.log('run resolved');
  return { onInit, onParams, onStatus, layoutLeft, layoutRight };
}
