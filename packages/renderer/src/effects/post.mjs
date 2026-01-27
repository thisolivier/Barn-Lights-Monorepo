import {
  applyBrightnessTint as _applyBrightnessTint,
  applyGamma as _applyGamma,
  applyStrobe as _applyStrobe,
  transformScene as _transformScene,
  clamp01,
} from "./modifiers.mjs";
import { audioState } from "../audio-state.mjs";

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
  if (post.pitchSpeed === 0) pitch = (post.pitch || 0) / 360 * W;
  if (post.yawSpeed === 0) yaw = (post.yaw || 0) * Math.PI / 180;
  const sx = ((pitch % W) + W) % W;
  const ang = yaw % (Math.PI * 2);
  post.pitch = (sx / W) * 360;
  post.yaw = ((ang * 180 / Math.PI) + 360) % 360;
  _transformScene(sceneF32, W, H, sx, 0, ang);
}

// -------- Audio-reactive post-processing effects --------

// Multiply brightness by audio RMS level
function applyAudioBrightness(sceneF32, t, post, W, H) {
  if (!audioState.enabled || !audioState.effects.brightness.enabled) return;

  const intensity = audioState.effects.brightness.intensity;
  const mult = audioState.rms * intensity;

  for (let i = 0; i < sceneF32.length; i++) {
    sceneF32[i] = clamp01(sceneF32[i] * mult);
  }
}

// Use frequency bands to create horizontal gradient mask
// Bass affects bottom, highs affect top
function applyAudioHorizontalMask(sceneF32, t, post, W, H) {
  if (!audioState.enabled || !audioState.effects.horizontalMask.enabled) return;

  const { bass, mids, highs } = audioState;

  for (let y = 0; y < H; y++) {
    // Normalize y position (0 = top, 1 = bottom)
    const yNorm = y / (H - 1);

    // Blend between bands based on vertical position
    // Top third: highs, middle third: mids, bottom third: bass
    let bandInfluence;
    if (yNorm < 0.33) {
      // Top - influenced by highs
      bandInfluence = highs;
    } else if (yNorm < 0.67) {
      // Middle - influenced by mids
      bandInfluence = mids;
    } else {
      // Bottom - influenced by bass
      bandInfluence = bass;
    }

    // Apply the mask to this row
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      sceneF32[i] = clamp01(sceneF32[i] * bandInfluence);
      sceneF32[i + 1] = clamp01(sceneF32[i + 1] * bandInfluence);
      sceneF32[i + 2] = clamp01(sceneF32[i + 2] * bandInfluence);
    }
  }
}

// Shift hue on beat with smooth decay between beats
let hueShiftAccum = 0;
function applyAudioHueShift(sceneF32, t, post, W, H) {
  if (!audioState.enabled || !audioState.effects.hueShift.enabled) return;

  const amount = audioState.effects.hueShift.amount;
  const timeSinceBeat = (Date.now() - audioState.lastBeatTime) / 1000;

  // On beat, add to accumulated hue shift
  if (audioState.beat) {
    hueShiftAccum += amount;
  }

  // Decay the accumulated shift over time
  const decayRate = 2.0; // Decay speed
  const currentShift = hueShiftAccum * Math.exp(-decayRate * timeSinceBeat);

  // Skip if shift is negligible
  if (Math.abs(currentShift) < 0.1) return;

  // Convert shift from degrees to normalized value (0-1 represents 0-360)
  const shiftNorm = (currentShift % 360) / 360;

  for (let i = 0; i < sceneF32.length; i += 3) {
    const r = sceneF32[i];
    const g = sceneF32[i + 1];
    const b = sceneF32[i + 2];

    // RGB to HSL
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
      // Achromatic, no hue to shift
      continue;
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h;
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }

    // Apply hue shift
    h = (h + shiftNorm + 1) % 1;

    // HSL to RGB
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    sceneF32[i] = clamp01(hue2rgb(p, q, h + 1/3));
    sceneF32[i + 1] = clamp01(hue2rgb(p, q, h));
    sceneF32[i + 2] = clamp01(hue2rgb(p, q, h - 1/3));
  }
}

export const postPipeline = [
  applyStrobe,
  applyBrightnessTint,
  applyGamma,
  applyTransform,
  // Audio-reactive effects (applied after existing effects)
  applyAudioBrightness,
  applyAudioHorizontalMask,
  applyAudioHueShift,
];