// Line Scanner Effect - Crosshair with independent X/Y position control
export const id = 'lineScanner';
export const displayName = 'Line Scanner';

export const defaultParams = {
  positionX: 0.5,
  positionY: 0.5,
  lineWidth: 0.02,
  lineColor: [1, 1, 1],
  backgroundColor: [0, 0, 0.05]
};

export const paramSchema = {
  positionX: { type: 'number', min: 0, max: 1, step: 0.01, label: 'X Position' },
  positionY: { type: 'number', min: 0, max: 1, step: 0.01, label: 'Y Position' },
  lineWidth: { type: 'number', min: 0.01, max: 0.2, step: 0.01, label: 'Line Width' }
};

export function render(sceneF32, W, H, t, params) {
  const {
    positionX = 0.5,
    positionY = 0.5,
    lineWidth = 0.02,
    lineColor = [1, 1, 1],
    backgroundColor = [0, 0, 0.05]
  } = params;

  const halfWidth = lineWidth / 2;

  for (let rowIndex = 0; rowIndex < H; rowIndex++) {
    for (let columnIndex = 0; columnIndex < W; columnIndex++) {
      const normalizedX = columnIndex / W;
      const normalizedY = rowIndex / H;

      // Calculate distance from each line
      const horizontalDistance = Math.abs(normalizedY - positionY);
      const verticalDistance = Math.abs(normalizedX - positionX);

      // Use the closer line's distance so the crosshair renders both lines
      // without double-brightening at the intersection
      const closestDistance = Math.min(horizontalDistance, verticalDistance);

      const pixelIndex = (rowIndex * W + columnIndex) * 3;

      if (closestDistance <= halfWidth) {
        // On or near a line - smooth falloff for anti-aliasing
        const intensity = 1 - (closestDistance / halfWidth);
        sceneF32[pixelIndex] = backgroundColor[0] + (lineColor[0] - backgroundColor[0]) * intensity;
        sceneF32[pixelIndex + 1] = backgroundColor[1] + (lineColor[1] - backgroundColor[1]) * intensity;
        sceneF32[pixelIndex + 2] = backgroundColor[2] + (lineColor[2] - backgroundColor[2]) * intensity;
      } else {
        // Background
        sceneF32[pixelIndex] = backgroundColor[0];
        sceneF32[pixelIndex + 1] = backgroundColor[1];
        sceneF32[pixelIndex + 2] = backgroundColor[2];
      }
    }
  }
}
