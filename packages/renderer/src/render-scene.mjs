// src/render-scene.mjs
import { effects } from "./effects/index.mjs";
import { postPipeline } from "./effects/post.mjs";

export const SCENE_W = 512, SCENE_H = 128;

// renderScene: draw the active effect into a buffer and apply post-processing
export function renderScene(sceneF32, t, P){
  const effect = effects[P.effect] || effects["gradient"];
  const effectParams = P.effects[effect.id] || {};
  effect.render(sceneF32, SCENE_W, SCENE_H, t, effectParams);
  const post = P.post;
  for (const fn of postPipeline){
    fn(sceneF32, t, post, SCENE_W, SCENE_H);
  }
}
