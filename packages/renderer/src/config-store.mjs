import fs from "fs/promises";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PRESET_DIR = path.join(ROOT, "config", "presets");

export async function listPresets(){
  try {
    const files = await fs.readdir(PRESET_DIR);
    return files.filter(f => f.endsWith('.json')).map(f => f.slice(0, -5));
  } catch {
    return [];
  }
}

export async function savePreset(name, params, imageBuf){
  await fs.mkdir(PRESET_DIR, { recursive: true });
  const presetPath = path.join(PRESET_DIR, `${name}.json`);

  const effectId = params.effect;
  const effectParams = params.effects?.[effectId] || {};
  const presetData = {
    effect: effectId,
    fpsCap: params.fpsCap,
    renderMode: params.renderMode,
    post: params.post,
    effects: { [effectId]: effectParams }
  };

  await fs.writeFile(presetPath, JSON.stringify(presetData, null, 2), "utf8");
  if (imageBuf){
    const imagePath = path.join(PRESET_DIR, `${name}.png`);
    await fs.writeFile(imagePath, imageBuf);
  }
}

export async function loadPreset(name, targetParams){
  const presetPath = path.join(PRESET_DIR, `${name}.json`);
  const raw = await fs.readFile(presetPath, "utf8");
  const loaded = JSON.parse(raw);

  if (targetParams){
    if ("fpsCap" in loaded) targetParams.fpsCap = loaded.fpsCap;
    if ("renderMode" in loaded) targetParams.renderMode = loaded.renderMode;
    if ("effect" in loaded) targetParams.effect = loaded.effect;
    if (loaded.post) Object.assign(targetParams.post, loaded.post);
    if (loaded.effects){
      for (const [id, paramsObj] of Object.entries(loaded.effects)){
        const existing = targetParams.effects[id] || {};
        targetParams.effects[id] = { ...existing, ...paramsObj };
      }
    }
  }

  return loaded;
}
