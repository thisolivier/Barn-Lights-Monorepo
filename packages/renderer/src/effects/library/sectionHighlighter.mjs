// Section Highlighter Effect - Lights sections one at a time with gradient
// Used for calibration to validate section positions

export const id = 'sectionHighlighter';
export const displayName = 'Section Highlighter';

// Dark pink #8B0A50 → Light green #90EE90
const GRADIENT_START = [0.545, 0.039, 0.314]; // Dark pink
const GRADIENT_END = [0.565, 0.933, 0.565];   // Light green

export const defaultParams = {
  side: 'left',
  sectionIndex: 0,
  sectionX0: 0,
  sectionX1: 1,
  sectionY: 0.5,
  samplingWidth: 7.0,
  samplingHeight: 1.0,
  lineThickness: 0.05,
  backgroundColor: [0.02, 0.02, 0.02]
};

export const paramSchema = {};

// Layout data will be injected via setLayoutData function
let layoutLeft = null;
let layoutRight = null;

export function setLayoutData(left, right) {
  layoutLeft = left;
  layoutRight = right;
}

function getAllSections(layout) {
  if (!layout || !layout.runs) return [];
  const sections = [];
  for (const run of layout.runs) {
    for (const section of run.sections) {
      sections.push(section);
    }
  }
  return sections;
}

function lerpColor(startColor, endColor, t) {
  return [
    startColor[0] + (endColor[0] - startColor[0]) * t,
    startColor[1] + (endColor[1] - startColor[1]) * t,
    startColor[2] + (endColor[2] - startColor[2]) * t
  ];
}

/**
 * Resolve section geometry. Two paths:
 * 1. Direct geometry params (browser preview) - sectionX0/sectionX1/sectionY
 *    are passed explicitly from CalibrationPage.
 * 2. Layout lookup (server-side) - fall back to module-level layout data using
 *    side + sectionIndex.
 *
 * Returns { normalizedX0, normalizedX1, normalizedY } or null if nothing to render.
 */
function resolveSectionGeometry(params) {
  const {
    sectionX0 = 0,
    sectionX1 = 1,
    sectionY = 0.5,
    samplingWidth: paramSamplingWidth = 7.0,
    samplingHeight: paramSamplingHeight = 1.0,
    side = 'left',
    sectionIndex = 0
  } = params;

  // Browser path: if explicit geometry params were provided (non-default values)
  const hasExplicitGeometry = params.sectionX0 !== undefined
    && params.sectionX1 !== undefined
    && params.sectionY !== undefined;

  if (hasExplicitGeometry) {
    return {
      normalizedX0: sectionX0 / paramSamplingWidth,
      normalizedX1: sectionX1 / paramSamplingWidth,
      normalizedY: sectionY / paramSamplingHeight
    };
  }

  // Server path: look up from module-level layout data
  const layout = side === 'left' ? layoutLeft : layoutRight;
  const sections = getAllSections(layout);

  if (sections.length === 0) return null;

  const clampedIndex = Math.min(sectionIndex, sections.length - 1);
  const section = sections[clampedIndex];
  if (!section) return null;

  const layoutSamplingWidth = layout.sampling?.width || 7.0;
  const layoutSamplingHeight = layout.sampling?.height || 1.0;

  return {
    normalizedX0: section.x0 / layoutSamplingWidth,
    normalizedX1: section.x1 / layoutSamplingWidth,
    normalizedY: section.y / layoutSamplingHeight
  };
}

export function render(sceneF32, W, H, t, params) {
  const {
    lineThickness = 0.05,
    backgroundColor = [0.02, 0.02, 0.02]
  } = params;

  const geometry = resolveSectionGeometry(params);

  if (!geometry) {
    // No geometry available - fill with error color (red tint)
    for (let pixelIndex = 0; pixelIndex < sceneF32.length; pixelIndex += 3) {
      sceneF32[pixelIndex] = 0.2;
      sceneF32[pixelIndex + 1] = 0;
      sceneF32[pixelIndex + 2] = 0;
    }
    return;
  }

  const { normalizedX0, normalizedX1, normalizedY } = geometry;
  const halfThickness = lineThickness / 2;

  // Fill background first
  for (let pixelIndex = 0; pixelIndex < sceneF32.length; pixelIndex += 3) {
    sceneF32[pixelIndex] = backgroundColor[0];
    sceneF32[pixelIndex + 1] = backgroundColor[1];
    sceneF32[pixelIndex + 2] = backgroundColor[2];
  }

  // Draw the section line with gradient
  const minX = Math.min(normalizedX0, normalizedX1);
  const maxX = Math.max(normalizedX0, normalizedX1);

  for (let row = 0; row < H; row++) {
    const normalizedPixelY = row / H;
    const yDistance = Math.abs(normalizedPixelY - normalizedY);

    if (yDistance > halfThickness) continue;

    const yIntensity = 1 - (yDistance / halfThickness);

    for (let col = 0; col < W; col++) {
      const normalizedPixelX = col / W;

      // Check if we're within the x range
      if (normalizedPixelX < minX || normalizedPixelX > maxX) continue;

      // Calculate position along the section (0-1)
      const sectionProgress = (normalizedPixelX - minX) / (maxX - minX);

      // Sample gradient color
      const gradientColor = lerpColor(GRADIENT_START, GRADIENT_END, sectionProgress);

      const bufferIndex = (row * W + col) * 3;
      sceneF32[bufferIndex] = gradientColor[0] * yIntensity;
      sceneF32[bufferIndex + 1] = gradientColor[1] * yIntensity;
      sceneF32[bufferIndex + 2] = gradientColor[2] * yIntensity;
    }
  }
}
