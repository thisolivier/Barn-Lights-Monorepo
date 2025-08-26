const fract = x => x - Math.floor(x);
const rand = n => fract(Math.sin(n) * 43758.5453123);

export const id = 'digitalRain';
export const displayName = 'Digital Rain';
export const defaultParams = {
  dropSpeed: 0.6,
  dropSize: 1,
  numberOfDrops: 40,
  tailLength: 8,
  dropColor: [0.0, 1.0, 0.0],
};
export const paramSchema = {
  dropSpeed: { type: 'number', min: 0, max: 5, step: 0.01, label: 'Drop Speed' },
  dropSize: { type: 'number', min: 1, max: 10, step: 1, label: 'Drop Width' },
  numberOfDrops: { type: 'number', min: 1, max: 200, step: 1, label: 'Drops' },
  tailLength: { type: 'number', min: 1, max: 50, step: 1, label: 'Tail Length' },
  dropColor: { type: 'color', label: 'Drop Color' },
};

export function render(sceneF32, W, H, t, params){
  const {
    dropSpeed = defaultParams.dropSpeed,
    dropSize = defaultParams.dropSize,
    numberOfDrops = defaultParams.numberOfDrops,
    tailLength = defaultParams.tailLength,
    dropColor = defaultParams.dropColor,
  } = params || {};

  sceneF32.fill(0);

  const maxX = Math.max(1, W - dropSize);
  const cycle = H + tailLength;

  for (let d = 0; d < numberOfDrops; d++){
    const x0 = Math.floor(rand(d) * maxX);
    const offset = rand(d + 1000) * cycle;
    const headY = (t * dropSpeed * H + offset) % cycle;
    for (let i = 0; i < tailLength; i++){
      const y = Math.floor(headY) - i;
      if (y < 0 || y >= H) continue;
      const fade = 1 - i / tailLength;
      for (let x = x0; x < x0 + dropSize && x < W; x++){
        const idx = (y * W + x) * 3;
        sceneF32[idx] = dropColor[0] * fade;
        sceneF32[idx + 1] = dropColor[1] * fade;
        sceneF32[idx + 2] = dropColor[2] * fade;
      }
    }
  }
}

