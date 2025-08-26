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

export async function savePreset(name, params){
  await fs.mkdir(PRESET_DIR, { recursive: true });
  const p = path.join(PRESET_DIR, `${name}.json`);
  await fs.writeFile(p, JSON.stringify(params, null, 2), "utf8");
}

export async function loadPreset(name){
  const p = path.join(PRESET_DIR, `${name}.json`);
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw);
}
