// src/render-scene.mjs
import { effects } from "./effects/index.mjs";
import { postPipeline } from "./effects/post.mjs";

export const SCENE_W = 512, SCENE_H = 128;

// renderScene: draw the active effect into a buffer and apply post-processing
export function renderScene(sceneF32, sceneW, sceneH, t, P){
  const effect = effects[P.effect] || effects["gradient"];
  const effectParams = P.effects[effect.id] || {};
  effect.render(sceneF32, sceneW, sceneH, t, effectParams);
  const post = P.post;
  for (const fn of postPipeline){
    fn(sceneF32, t, post, sceneW, sceneH);
  }
}

let extendedFrame = null;

// renderFrames: fill left/right frame buffers according to renderMode
export function renderFrames(leftFrame, rightFrame, P, t){
  const mode = P.renderMode;
  if (mode === "extended"){
    const W = SCENE_W * 2;
    if (!extendedFrame || extendedFrame.length !== W * SCENE_H * 3){
      extendedFrame = new Float32Array(W * SCENE_H * 3);
    }
    renderScene(extendedFrame, W, SCENE_H, t, P);
    for (let y = 0; y < SCENE_H; y++){
      const src = y * W * 3;
      const dst = y * SCENE_W * 3;
      leftFrame.set(extendedFrame.subarray(src, src + SCENE_W * 3), dst);
      rightFrame.set(extendedFrame.subarray(src + SCENE_W * 3, src + W * 3), dst);
    }
  } else {
    renderScene(leftFrame, SCENE_W, SCENE_H, t, P);
    if (mode === "mirror"){
      // flip horizontally: reflect x but keep y aligned
      for (let y = 0; y < SCENE_H; y++){
        for (let x = 0; x < SCENE_W; x++){
          const src = (y * SCENE_W + (SCENE_W - 1 - x)) * 3;
          const dst = (y * SCENE_W + x) * 3;
          rightFrame[dst] = leftFrame[src];
          rightFrame[dst + 1] = leftFrame[src + 1];
          rightFrame[dst + 2] = leftFrame[src + 2];
        }
      }
    } else {
      rightFrame.set(leftFrame);
    }
  }
}
