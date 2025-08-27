import { clamp01 } from '../modifiers.mjs';
import { sortColorStops, sampleGradient } from './gradient-utils.mjs';

function vnoise2(x, y){
  return 0.5 + 0.5 * Math.sin((x * 12.9898 + y * 78.233) * 43758.5453);
}
function fbm(x, y, oct = 4){
  let acc = 0, freq = 1, amp = 0.5;
  for (let i = 0; i < oct; i++){
    acc += amp * vnoise2(x * freq, y * freq);
    freq *= 2;
    amp *= 0.5;
  }
  return acc;
}

export const id = 'noise';
export const displayName = 'Noise';
export const defaultParams = {
  noiseSpeed: 0.35,
  noiseScale: 2.2,
  noiseIntensity: 1.2,
  stops: [
    { pos: 0.00, color: [0.0, 0.0, 0.0] },
    { pos: 0.33, color: [1.0, 0.0, 0.0] },
    { pos: 0.66, color: [1.0, 0.5, 0.0] },
    { pos: 1.00, color: [1.0, 1.0, 1.0] },
  ],
};
export const paramSchema = {
  noiseSpeed:     { type: 'number', min: 0, max: 5, step: 0.01 },
  noiseScale:     { type: 'number', min: 0.5, max: 10, step: 0.1 },
  noiseIntensity: { type: 'number', min: 0, max: 3, step: 0.01 },
  stops:          { type: 'colorStops', label: 'Stops' },
};

export function render(sceneF32, W, H, t, params){
  const {
    noiseSpeed = 0.35,
    noiseScale = 2.2,
    noiseIntensity = 1.2,
    stops = [],
  } = params;
  if (stops.length < 2) return;
  const sortedStops = sortColorStops(stops);
  for (let y = 0; y < H; y++){
    for (let x = 0; x < W; x++){
      const n = fbm(x / (W / noiseScale), (y / (H / noiseScale)) - t * noiseSpeed, 4);
      const heat = clamp01(Math.pow(clamp01(n * 1.2 - (1 - y / H) * 0.6), 1.2) * noiseIntensity);
      const rgb = sampleGradient(sortedStops, heat);
      const i = (y * W + x) * 3;
      sceneF32[i] = rgb[0];
      sceneF32[i + 1] = rgb[1];
      sceneF32[i + 2] = rgb[2];
    }
  }
}
