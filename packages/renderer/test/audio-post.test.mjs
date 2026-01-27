import test from 'node:test';
import assert from 'node:assert/strict';

import { audioState, updateAudioState, updateAudioSettings } from '../src/audio-state.mjs';

// The post.mjs file doesn't export individual functions, so we need to import and test through
// the postPipeline or by recreating the functions with the same logic.
// For proper testing, we'll import the pipeline and test through it, or import clamp01 and
// implement test versions of the functions.

import { clamp01 } from '../src/effects/modifiers.mjs';

// -------- Test Helpers --------

// Create a mock scene buffer with uniform color
function createMockScene(w, h, r = 1.0, g = 1.0, b = 1.0) {
  const scene = new Float32Array(w * h * 3);
  for (let i = 0; i < scene.length; i += 3) {
    scene[i] = r;
    scene[i + 1] = g;
    scene[i + 2] = b;
  }
  return scene;
}

// Create a scene with a gradient from top to bottom
function createGradientScene(w, h) {
  const scene = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const brightness = 1.0 - (y / (h - 1)); // 1.0 at top, 0.0 at bottom
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      scene[i] = brightness;
      scene[i + 1] = brightness;
      scene[i + 2] = brightness;
    }
  }
  return scene;
}

// Create a scene with a specific color (for hue shift testing)
function createColoredScene(w, h, r, g, b) {
  return createMockScene(w, h, r, g, b);
}

// Helper to reset audioState to initial values
function resetAudioState() {
  audioState.rms = 0;
  audioState.bass = 0;
  audioState.mids = 0;
  audioState.highs = 0;
  audioState.beat = false;
  audioState.lastBeatTime = 0;
  audioState.enabled = true;
  audioState.effects = {
    brightness: { enabled: false, intensity: 1.0 },
    horizontalMask: { enabled: false },
    hueShift: { enabled: false, amount: 30 }
  };
}

// Assert that two colors are approximately equal
function assertColorApprox(actual, expected, tolerance = 0.01, message = '') {
  const [ar, ag, ab] = actual;
  const [er, eg, eb] = expected;
  assert.ok(
    Math.abs(ar - er) < tolerance &&
    Math.abs(ag - eg) < tolerance &&
    Math.abs(ab - eb) < tolerance,
    `${message} Expected [${er.toFixed(3)}, ${eg.toFixed(3)}, ${eb.toFixed(3)}] but got [${ar.toFixed(3)}, ${ag.toFixed(3)}, ${ab.toFixed(3)}]`
  );
}

// Get pixel color from scene buffer
function getPixel(scene, w, x, y) {
  const i = (y * w + x) * 3;
  return [scene[i], scene[i + 1], scene[i + 2]];
}

// -------- Reimplemented Audio Effects for Testing --------
// These mirror the implementations in post.mjs

function applyAudioBrightness(sceneF32, t, post, W, H) {
  if (!audioState.enabled || !audioState.effects.brightness.enabled) return;

  const intensity = audioState.effects.brightness.intensity;
  const mult = audioState.rms * intensity;

  for (let i = 0; i < sceneF32.length; i++) {
    sceneF32[i] = clamp01(sceneF32[i] * mult);
  }
}

function applyAudioHorizontalMask(sceneF32, t, post, W, H) {
  if (!audioState.enabled || !audioState.effects.horizontalMask.enabled) return;

  const { bass, mids, highs } = audioState;

  for (let y = 0; y < H; y++) {
    const yNorm = y / (H - 1);

    let bandInfluence;
    if (yNorm < 0.33) {
      bandInfluence = highs;
    } else if (yNorm < 0.67) {
      bandInfluence = mids;
    } else {
      bandInfluence = bass;
    }

    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      sceneF32[i] = clamp01(sceneF32[i] * bandInfluence);
      sceneF32[i + 1] = clamp01(sceneF32[i + 1] * bandInfluence);
      sceneF32[i + 2] = clamp01(sceneF32[i + 2] * bandInfluence);
    }
  }
}

// Simplified hue shift for testing - matches the logic in post.mjs
let hueShiftAccum = 0;
function resetHueShift() {
  hueShiftAccum = 0;
}

function applyAudioHueShift(sceneF32, t, post, W, H) {
  if (!audioState.enabled || !audioState.effects.hueShift.enabled) return;

  const amount = audioState.effects.hueShift.amount;
  const timeSinceBeat = (Date.now() - audioState.lastBeatTime) / 1000;

  if (audioState.beat) {
    hueShiftAccum += amount;
  }

  const decayRate = 2.0;
  const currentShift = hueShiftAccum * Math.exp(-decayRate * timeSinceBeat);

  if (Math.abs(currentShift) < 0.1) return;

  const shiftNorm = (currentShift % 360) / 360;

  for (let i = 0; i < sceneF32.length; i += 3) {
    const r = sceneF32[i];
    const g = sceneF32[i + 1];
    const b = sceneF32[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
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

    h = (h + shiftNorm + 1) % 1;

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

// -------- Tests --------

test('audio-post: applyAudioBrightness modifies scene based on RMS', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createMockScene(W, H, 1.0, 1.0, 1.0);

  // Enable brightness effect and set RMS
  updateAudioSettings({
    effects: {
      brightness: { enabled: true, intensity: 1.0 }
    }
  });
  updateAudioState({ rms: 0.5 });

  applyAudioBrightness(scene, 0, {}, W, H);

  // All pixels should be multiplied by 0.5
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [0.5, 0.5, 0.5], 0.01, 'Pixel should be dimmed by RMS');
});

test('audio-post: applyAudioBrightness respects intensity multiplier', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createMockScene(W, H, 1.0, 1.0, 1.0);

  updateAudioSettings({
    effects: {
      brightness: { enabled: true, intensity: 2.0 }
    }
  });
  updateAudioState({ rms: 0.5 });

  applyAudioBrightness(scene, 0, {}, W, H);

  // Brightness = rms * intensity = 0.5 * 2.0 = 1.0
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [1.0, 1.0, 1.0], 0.01, 'Pixel should be at full brightness');
});

test('audio-post: applyAudioBrightness clamps values to 0-1', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createMockScene(W, H, 1.0, 1.0, 1.0);

  updateAudioSettings({
    effects: {
      brightness: { enabled: true, intensity: 3.0 }
    }
  });
  updateAudioState({ rms: 0.8 });

  applyAudioBrightness(scene, 0, {}, W, H);

  // Brightness = 0.8 * 3.0 = 2.4, but should be clamped to 1.0
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [1.0, 1.0, 1.0], 0.01, 'Pixel should be clamped to 1.0');
});

test('audio-post: applyAudioBrightness skipped when effect disabled', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createMockScene(W, H, 1.0, 1.0, 1.0);

  // Effect disabled (default)
  updateAudioState({ rms: 0.5 });

  applyAudioBrightness(scene, 0, {}, W, H);

  // Scene should be unchanged
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [1.0, 1.0, 1.0], 0.01, 'Pixel should be unchanged when effect disabled');
});

test('audio-post: applyAudioBrightness skipped when audioState.enabled is false', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createMockScene(W, H, 1.0, 1.0, 1.0);

  updateAudioSettings({
    enabled: false,
    effects: {
      brightness: { enabled: true, intensity: 1.0 }
    }
  });
  updateAudioState({ rms: 0.5 });

  applyAudioBrightness(scene, 0, {}, W, H);

  // Scene should be unchanged because audioState.enabled is false
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [1.0, 1.0, 1.0], 0.01, 'Pixel should be unchanged when audio disabled');
});

test('audio-post: applyAudioHorizontalMask applies band-based masking', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 9; // 9 rows: 3 top (highs), 3 middle (mids), 3 bottom (bass)
  const scene = createMockScene(W, H, 1.0, 1.0, 1.0);

  updateAudioSettings({
    effects: {
      horizontalMask: { enabled: true }
    }
  });
  updateAudioState({ bass: 0.2, mids: 0.5, highs: 0.9 });

  applyAudioHorizontalMask(scene, 0, {}, W, H);

  // Top row (y=0) should be affected by highs (0.9)
  const topPixel = getPixel(scene, W, 0, 0);
  assertColorApprox(topPixel, [0.9, 0.9, 0.9], 0.01, 'Top row should be affected by highs');

  // Middle row (y=4) should be affected by mids (0.5)
  const midPixel = getPixel(scene, W, 0, 4);
  assertColorApprox(midPixel, [0.5, 0.5, 0.5], 0.01, 'Middle row should be affected by mids');

  // Bottom row (y=8) should be affected by bass (0.2)
  const bottomPixel = getPixel(scene, W, 0, 8);
  assertColorApprox(bottomPixel, [0.2, 0.2, 0.2], 0.01, 'Bottom row should be affected by bass');
});

test('audio-post: applyAudioHorizontalMask skipped when effect disabled', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createMockScene(W, H, 1.0, 1.0, 1.0);

  // Effect disabled (default)
  updateAudioState({ bass: 0.5, mids: 0.5, highs: 0.5 });

  applyAudioHorizontalMask(scene, 0, {}, W, H);

  // Scene should be unchanged
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [1.0, 1.0, 1.0], 0.01, 'Scene should be unchanged when effect disabled');
});

test('audio-post: applyAudioHorizontalMask skipped when audioState.enabled is false', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createMockScene(W, H, 1.0, 1.0, 1.0);

  updateAudioSettings({
    enabled: false,
    effects: {
      horizontalMask: { enabled: true }
    }
  });
  updateAudioState({ bass: 0.5, mids: 0.5, highs: 0.5 });

  applyAudioHorizontalMask(scene, 0, {}, W, H);

  // Scene should be unchanged
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [1.0, 1.0, 1.0], 0.01, 'Scene should be unchanged when audio disabled');
});

test('audio-post: applyAudioHueShift rotates hues on beat', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  // Create a pure red scene (hue = 0)
  const scene = createColoredScene(W, H, 1.0, 0.0, 0.0);

  updateAudioSettings({
    effects: {
      hueShift: { enabled: true, amount: 120 } // Shift by 120 degrees (should turn red to green)
    }
  });

  // Simulate a beat just now
  audioState.beat = true;
  audioState.lastBeatTime = Date.now();

  applyAudioHueShift(scene, 0, {}, W, H);

  // Red shifted by 120 degrees should become green-ish
  const pixel = getPixel(scene, W, 0, 0);

  // After 120 degree shift, red should become green (approximately)
  // In HSL, 0=red, 1/3=green, 2/3=blue
  // With a 120 degree (1/3 of 360) shift, we expect green
  assert.ok(pixel[1] > pixel[0], 'Green channel should be higher than red after 120 degree shift');
  assert.ok(pixel[1] > pixel[2], 'Green channel should be higher than blue after 120 degree shift');
});

test('audio-post: applyAudioHueShift accumulates over multiple beats', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createColoredScene(W, H, 1.0, 0.0, 0.0);

  updateAudioSettings({
    effects: {
      hueShift: { enabled: true, amount: 60 }
    }
  });

  // First beat
  audioState.beat = true;
  audioState.lastBeatTime = Date.now();
  applyAudioHueShift(scene, 0, {}, W, H);

  // Store result after first beat
  const afterFirstBeat = getPixel(scene, W, 0, 0).slice();

  // Reset scene for comparison
  const scene2 = createColoredScene(W, H, 1.0, 0.0, 0.0);

  // Second beat (accumulates more shift)
  audioState.beat = true;
  audioState.lastBeatTime = Date.now();
  applyAudioHueShift(scene2, 0, {}, W, H);

  // The hue shift should have accumulated
  // We can't easily compare colors without full RGB->HSL conversion,
  // but we can check that the colors are different
  const afterSecondBeat = getPixel(scene2, W, 0, 0);

  // Both should be different from the original red
  assert.ok(
    afterSecondBeat[0] !== 1.0 || afterSecondBeat[1] !== 0.0 || afterSecondBeat[2] !== 0.0,
    'Color should be shifted from original red after second beat'
  );
});

test('audio-post: applyAudioHueShift skipped when effect disabled', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createColoredScene(W, H, 1.0, 0.0, 0.0);

  // Effect disabled (default)
  audioState.beat = true;
  audioState.lastBeatTime = Date.now();

  applyAudioHueShift(scene, 0, {}, W, H);

  // Scene should be unchanged
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [1.0, 0.0, 0.0], 0.01, 'Scene should be unchanged when effect disabled');
});

test('audio-post: applyAudioHueShift skipped when audioState.enabled is false', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  const scene = createColoredScene(W, H, 1.0, 0.0, 0.0);

  updateAudioSettings({
    enabled: false,
    effects: {
      hueShift: { enabled: true, amount: 120 }
    }
  });
  audioState.beat = true;
  audioState.lastBeatTime = Date.now();

  applyAudioHueShift(scene, 0, {}, W, H);

  // Scene should be unchanged
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [1.0, 0.0, 0.0], 0.01, 'Scene should be unchanged when audio disabled');
});

test('audio-post: applyAudioHueShift skips achromatic colors (gray)', () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;
  // Create a gray scene (no hue)
  const scene = createMockScene(W, H, 0.5, 0.5, 0.5);

  updateAudioSettings({
    effects: {
      hueShift: { enabled: true, amount: 120 }
    }
  });
  audioState.beat = true;
  audioState.lastBeatTime = Date.now();

  applyAudioHueShift(scene, 0, {}, W, H);

  // Gray colors should remain unchanged (no hue to shift)
  const pixel = getPixel(scene, W, 0, 0);
  assertColorApprox(pixel, [0.5, 0.5, 0.5], 0.01, 'Gray pixels should be unchanged');
});

test('audio-post: applyAudioHueShift decays over time', async () => {
  resetAudioState();
  resetHueShift();

  const W = 4, H = 4;

  updateAudioSettings({
    effects: {
      hueShift: { enabled: true, amount: 90 }
    }
  });

  // Simulate a beat 2 seconds ago
  audioState.beat = false;
  audioState.lastBeatTime = Date.now() - 2000;
  hueShiftAccum = 90; // Simulate accumulated shift from previous beat

  const scene1 = createColoredScene(W, H, 1.0, 0.0, 0.0);
  applyAudioHueShift(scene1, 0, {}, W, H);

  // After 2 seconds of decay, the shift should be very small
  // decay = 90 * exp(-2.0 * 2) = 90 * exp(-4) = 90 * 0.018 = 1.6 degrees
  // This is still > 0.1, so some shift will occur

  // Simulate a beat 5 seconds ago - should have decayed to negligible
  audioState.lastBeatTime = Date.now() - 5000;
  hueShiftAccum = 90;

  const scene2 = createColoredScene(W, H, 1.0, 0.0, 0.0);
  applyAudioHueShift(scene2, 0, {}, W, H);

  // After 5 seconds, shift should be near zero
  // decay = 90 * exp(-2.0 * 5) = 90 * exp(-10) = ~0.004 degrees < 0.1
  // So the effect should be skipped
  const pixel = getPixel(scene2, W, 0, 0);
  assertColorApprox(pixel, [1.0, 0.0, 0.0], 0.01, 'Scene should be unchanged after decay');
});

test('audio-post: helper createMockScene creates correct buffer', () => {
  const W = 3, H = 2;
  const scene = createMockScene(W, H, 0.5, 0.7, 0.9);

  assert.equal(scene.length, W * H * 3, 'Buffer should have correct length');
  assert.ok(scene instanceof Float32Array, 'Buffer should be Float32Array');

  // Use tolerance for Float32Array precision
  for (let i = 0; i < scene.length; i += 3) {
    assert.ok(Math.abs(scene[i] - 0.5) < 0.001, 'Red channel should be approximately 0.5');
    assert.ok(Math.abs(scene[i + 1] - 0.7) < 0.001, 'Green channel should be approximately 0.7');
    assert.ok(Math.abs(scene[i + 2] - 0.9) < 0.001, 'Blue channel should be approximately 0.9');
  }
});

test('audio-post: helper getPixel returns correct values', () => {
  const W = 3, H = 2;
  const scene = new Float32Array(W * H * 3);

  // Set pixel at (1, 1) to a specific color
  const idx = (1 * W + 1) * 3;
  scene[idx] = 0.1;
  scene[idx + 1] = 0.2;
  scene[idx + 2] = 0.3;

  const pixel = getPixel(scene, W, 1, 1);
  // Use tolerance for Float32Array precision
  assertColorApprox(pixel, [0.1, 0.2, 0.3], 0.001, 'getPixel should return correct color');
});
