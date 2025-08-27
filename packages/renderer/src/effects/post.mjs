import {
  applyBrightnessTint as _applyBrightnessTint,
  applyGamma as _applyGamma,
  applyStrobe as _applyStrobe,
  transformScene as _transformScene,
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

let pitch = 0, yaw = 0, lastT = 0;
function applyTransform(sceneF32, t, post, W, H){
  const dt = lastT ? t - lastT : 0;
  lastT = t;
  pitch += post.pitchSpeed * dt;
  yaw += post.yawSpeed * dt;
  const sx = ((pitch % W) + W) % W;
  const ang = yaw % (Math.PI * 2);
  post.pitch = (sx / W) * 360;
  post.yaw = ((ang * 180 / Math.PI) + 360) % 360;
  _transformScene(sceneF32, W, H, sx, 0, ang);
}

export const postPipeline = [applyStrobe, applyBrightnessTint, applyGamma, applyTransform];