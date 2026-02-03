// Line Scanner Effect - Sweeping horizontal/vertical line for position validation
export const id = 'lineScanner';
export const displayName = 'Line Scanner';

export const defaultParams = {
  mode: 'horizontal',
  position: 0.5,
  autoSweep: true,
  speed: 0.5,
  lineWidth: 0.02,
  lineColor: [1, 1, 1],
  backgroundColor: [0, 0, 0.05]
};

export const paramSchema = {
  mode: { type: 'enum', options: ['horizontal', 'vertical'], label: 'Direction' },
  position: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Position' },
  autoSweep: { type: 'checkbox', label: 'Auto Sweep' },
  speed: { type: 'number', min: 0.1, max: 2, step: 0.1, label: 'Speed' },
  lineWidth: { type: 'number', min: 0.01, max: 0.2, step: 0.01, label: 'Line Width' }
};

export function render(sceneF32, W, H, t, params) {
  const {
    mode = 'horizontal',
    position = 0.5,
    autoSweep = true,
    speed = 0.5,
    lineWidth = 0.02,
    lineColor = [1, 1, 1],
    backgroundColor = [0, 0, 0.05]
  } = params;

  // Calculate line position (0-1 range)
  let linePos;
  if (autoSweep) {
    // Triangle wave: oscillate from 0 to 1 and back
    const phase = (t * speed) % 2;
    linePos = phase < 1 ? phase : 2 - phase;
  } else {
    linePos = position;
  }

  const halfWidth = lineWidth / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const normalizedX = x / W;
      const normalizedY = y / H;

      // Calculate distance from line
      let distance;
      if (mode === 'horizontal') {
        distance = Math.abs(normalizedY - linePos);
      } else {
        distance = Math.abs(normalizedX - linePos);
      }

      const index = (y * W + x) * 3;

      if (distance <= halfWidth) {
        // On the line - smooth falloff for anti-aliasing
        const intensity = 1 - (distance / halfWidth);
        sceneF32[index] = backgroundColor[0] + (lineColor[0] - backgroundColor[0]) * intensity;
        sceneF32[index + 1] = backgroundColor[1] + (lineColor[1] - backgroundColor[1]) * intensity;
        sceneF32[index + 2] = backgroundColor[2] + (lineColor[2] - backgroundColor[2]) * intensity;
      } else {
        // Background
        sceneF32[index] = backgroundColor[0];
        sceneF32[index + 1] = backgroundColor[1];
        sceneF32[index + 2] = backgroundColor[2];
      }
    }
  }
}
