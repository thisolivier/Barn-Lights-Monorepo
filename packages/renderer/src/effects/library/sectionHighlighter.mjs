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
  autoAdvance: false,
  advanceInterval: 2.0,
  lineThickness: 0.05,
  backgroundColor: [0.02, 0.02, 0.02]
};

export const paramSchema = {
  side: { type: 'enum', options: ['left', 'right'], label: 'Side' },
  sectionIndex: { type: 'number', min: 0, max: 20, step: 1, label: 'Section Index' },
  autoAdvance: { type: 'checkbox', label: 'Auto Advance' },
  advanceInterval: { type: 'number', min: 0.5, max: 10, step: 0.5, label: 'Interval (s)' },
  lineThickness: { type: 'number', min: 0.01, max: 0.2, step: 0.01, label: 'Line Thickness' }
};

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

export function render(sceneF32, W, H, t, params) {
  const {
    side = 'left',
    sectionIndex = 0,
    autoAdvance = false,
    advanceInterval = 2.0,
    lineThickness = 0.05,
    backgroundColor = [0.02, 0.02, 0.02]
  } = params;

  const layout = side === 'left' ? layoutLeft : layoutRight;
  const sections = getAllSections(layout);

  if (sections.length === 0) {
    // No layout data - fill with error color (red tint)
    for (let i = 0; i < sceneF32.length; i += 3) {
      sceneF32[i] = 0.2;
      sceneF32[i + 1] = 0;
      sceneF32[i + 2] = 0;
    }
    return;
  }

  // Calculate current section index
  let currentIndex;
  if (autoAdvance) {
    const totalSections = sections.length;
    currentIndex = Math.floor(t / advanceInterval) % totalSections;
  } else {
    currentIndex = Math.min(sectionIndex, sections.length - 1);
  }

  const section = sections[currentIndex];
  if (!section) return;

  // Get sampling dimensions from layout
  const samplingWidth = layout.sampling?.width || 7.0;
  const samplingHeight = layout.sampling?.height || 1.0;

  // Normalize section coordinates to 0-1 range
  const normalizedX0 = section.x0 / samplingWidth;
  const normalizedX1 = section.x1 / samplingWidth;
  const normalizedY = section.y / samplingHeight;

  const halfThickness = lineThickness / 2;

  // Fill background first
  for (let i = 0; i < sceneF32.length; i += 3) {
    sceneF32[i] = backgroundColor[0];
    sceneF32[i + 1] = backgroundColor[1];
    sceneF32[i + 2] = backgroundColor[2];
  }

  // Draw the section line with gradient
  const minX = Math.min(normalizedX0, normalizedX1);
  const maxX = Math.max(normalizedX0, normalizedX1);

  for (let y = 0; y < H; y++) {
    const normalizedPixelY = y / H;
    const yDistance = Math.abs(normalizedPixelY - normalizedY);

    if (yDistance > halfThickness) continue;

    const yIntensity = 1 - (yDistance / halfThickness);

    for (let x = 0; x < W; x++) {
      const normalizedPixelX = x / W;

      // Check if we're within the x range
      if (normalizedPixelX < minX || normalizedPixelX > maxX) continue;

      // Calculate position along the section (0-1)
      const sectionProgress = (normalizedPixelX - minX) / (maxX - minX);

      // Sample gradient color
      const gradientColor = lerpColor(GRADIENT_START, GRADIENT_END, sectionProgress);

      const index = (y * W + x) * 3;
      sceneF32[index] = gradientColor[0] * yIntensity;
      sceneF32[index + 1] = gradientColor[1] * yIntensity;
      sceneF32[index + 2] = gradientColor[2] * yIntensity;
    }
  }
}
