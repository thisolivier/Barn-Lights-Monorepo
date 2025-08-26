import {
  applyBrightnessTint as _applyBrightnessTint,
  applyGamma as _applyGamma,
  applyStrobe as _applyStrobe,
  applyRollX as _applyRollX,
} from "./modifiers.mjs";

function applyStrobe(sceneF32, t, post, W, H){
  _applyStrobe(sceneF32, t, post.strobeHz, post.strobeDuty, post.strobeLow);
}

function applyBrightnessTint(sceneF32, t, post, W, H){
  _applyBrightnessTint(sceneF32, post.tint, post.brightness);
}

function applyGamma(sceneF32, t, post, W, H){
  _applyGamma(sceneF32, post.gamma);
}

function applyRollX(sceneF32, t, post, W, H){
  _applyRollX(sceneF32, W, H, post.rollPx);
}

export const postPipeline = [applyStrobe, applyBrightnessTint, applyGamma, applyRollX];

export function registerPostModifier(fn){
  postPipeline.push(fn);
}
