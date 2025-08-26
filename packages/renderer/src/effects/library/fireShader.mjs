import { clamp01 } from '../modifiers.mjs';

// Value noise and FBM helpers
function vnoise2(x, y){
  return 0.5 + 0.5 * Math.sin((x * 12.9898 + y * 78.233) * 43758.5453);
}

function fbm(x, y, octaves = 4){
  let amplitude = 0.5;
  let frequency = 1.0;
  let sum = 0.0;
  for (let i = 0; i < octaves; i++){
    sum += amplitude * vnoise2(x * frequency, y * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return sum;
}

function lerp(a, b, t){
  return a + (b - a) * t;
}

function mixColors(a, b, t){
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function sampleGradient(stops, t){
  if (!stops.length) return [t, t, t];
  if (t <= stops[0].pos) return stops[0].color;
  for (let i = 0; i < stops.length - 1; i++){
    const a = stops[i];
    const b = stops[i + 1];
    if (t <= b.pos){
      const f = (t - a.pos) / Math.max(1e-6, b.pos - a.pos);
      return mixColors(a.color, b.color, f);
    }
  }
  return stops[stops.length - 1].color;
}

export const id = 'fireShader';
export const displayName = 'Fire Shader';
export const defaultParams = {
  speed: 0.3,
  angle: 0.0,
  flameHeight: 1.5,
  colors: [
    { pos: 0.0, color: [0.0, 0.0, 0.0] },
    { pos: 0.3, color: [1.0, 0.0, 0.0] },
    { pos: 0.6, color: [1.0, 0.5, 0.0] },
    { pos: 1.0, color: [1.0, 1.0, 1.0] },
  ],
};
export const paramSchema = {
  speed: { type: 'number', min: 0, max: 5, step: 0.01, label: 'Speed' },
  angle: { type: 'number', min: -Math.PI, max: Math.PI, step: 0.01, label: 'Angle (rad)' },
  flameHeight: { type: 'number', min: 0.1, max: 3, step: 0.01, label: 'Flame Height' },
  colors: { type: 'colorStops', label: 'Colors' },
};

export function render(sceneF32, W, H, t, params){
  const {
    speed = defaultParams.speed,
    angle = defaultParams.angle,
    flameHeight = defaultParams.flameHeight,
    colors = defaultParams.colors,
  } = params || {};

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const sortedStops = [...colors].sort((a, b) => a.pos - b.pos);

  for (let y = 0; y < H; y++){
    for (let x = 0; x < W; x++){
      let u = x / W;
      let v = y / H;

      const cx = u - 0.5;
      const cy = v - 0.5;
      const rx = cx * cosA - cy * sinA;
      const ry = cx * sinA + cy * cosA;
      u = rx + 0.5;
      v = ry + 0.5;

      const noise = fbm(u * 3.0, (v * 3.0) - t * speed, 5);
      const heightFactor = clamp01(1 - v * flameHeight);
      const heat = clamp01(noise * heightFactor);
      const rgb = sampleGradient(sortedStops, heat);

      const i = (y * W + x) * 3;
      sceneF32[i] = rgb[0];
      sceneF32[i + 1] = rgb[1];
      sceneF32[i + 2] = rgb[2];
    }
  }
}

