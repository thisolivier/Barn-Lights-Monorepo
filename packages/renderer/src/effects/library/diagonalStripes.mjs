export const id = 'diagonalStripes';
export const displayName = 'Diagonal Stripes';
export const defaultParams = {
  colorA: [1.0, 1.0, 1.0],
  colorB: [0.0, 0.0, 0.0],
  width: 0.1,
  angle: 45,
};
export const paramSchema = {
  colorA: { type: 'color', label: 'Color A' },
  colorB: { type: 'color', label: 'Color B' },
  width: { type: 'number', min: 0.01, max: 1, step: 0.01 },
  angle: { type: 'number', min: 0, max: 180, step: 1 },
};

export function render(sceneF32, W, H, t, params){
  const {
    colorA = [1, 1, 1],
    colorB = [0, 0, 0],
    width = 0.1,
    angle = 45,
  } = params;
  const diag = Math.hypot(W, H);
  const stripeWidth = Math.max(1e-6, width) * diag;
  const rad = angle * Math.PI / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  let i = 0;
  for(let y = 0; y < H; y++){
    for(let x = 0; x < W; x++){
      const coord = x * cosA - y * sinA;
      const stripeIndex = Math.floor(coord / stripeWidth);
      const useA = (stripeIndex & 1) === 0;
      const c = useA ? colorA : colorB;
      sceneF32[i++] = c[0];
      sceneF32[i++] = c[1];
      sceneF32[i++] = c[2];
    }
  }
}
