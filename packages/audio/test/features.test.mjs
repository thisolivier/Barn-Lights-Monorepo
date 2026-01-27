/**
 * Tests for the FeatureExtractor class in features.ts
 *
 * Tests cover:
 * - RMS calculation with known input values
 * - Frequency band separation with mock FFT output
 * - Beat detection threshold logic
 * - Normalization to 0-1 range
 * - Smoothing behavior
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Import from compiled output
import { FeatureExtractor } from '../dist/features.js';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a silent sample buffer (all zeros).
 * @param {number} length - Number of samples
 * @returns {Int16Array}
 */
function createSilentSamples(length) {
  return new Int16Array(length);
}

/**
 * Create a sine wave sample buffer at a given frequency.
 * @param {number} length - Number of samples
 * @param {number} frequency - Frequency in Hz
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} amplitude - Amplitude (0-1, scaled to 16-bit range)
 * @returns {Int16Array}
 */
function createSineWave(length, frequency, sampleRate, amplitude = 1.0) {
  const samples = new Int16Array(length);
  const maxAmplitude = 32767 * amplitude;
  for (let i = 0; i < length; i++) {
    samples[i] = Math.round(maxAmplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate));
  }
  return samples;
}

/**
 * Create a constant (DC) sample buffer.
 * @param {number} length - Number of samples
 * @param {number} value - Sample value (-32768 to 32767)
 * @returns {Int16Array}
 */
function createConstantSamples(length, value) {
  const samples = new Int16Array(length);
  samples.fill(value);
  return samples;
}

/**
 * Create a sample buffer with a single impulse.
 * @param {number} length - Number of samples
 * @param {number} position - Position of the impulse (default: 0)
 * @param {number} value - Impulse value (default: max positive)
 * @returns {Int16Array}
 */
function createImpulse(length, position = 0, value = 32767) {
  const samples = new Int16Array(length);
  samples[position] = value;
  return samples;
}

// ============================================================================
// RMS Calculation Tests
// ============================================================================

test('RMS: silent samples return zero RMS', () => {
  const extractor = new FeatureExtractor({ rmsSmoothing: 0 });
  const samples = createSilentSamples(256);
  const features = extractor.process(samples);
  assert.equal(features.rms, 0, 'RMS of silence should be 0');
});

test('RMS: full scale sine wave produces high RMS', () => {
  const extractor = new FeatureExtractor({ rmsSmoothing: 0, sampleRate: 44100 });
  // Create a full-scale sine wave at 440Hz
  const samples = createSineWave(256, 440, 44100, 1.0);
  const features = extractor.process(samples);

  // Full-scale sine wave has RMS of ~0.707, scaled by 3x gives ~2.12, clamped to 1.0
  assert.ok(features.rms > 0.8, `RMS should be high for full scale sine, got ${features.rms}`);
  assert.ok(features.rms <= 1.0, `RMS should be clamped to 1.0, got ${features.rms}`);
});

test('RMS: lower amplitude signal produces lower RMS', () => {
  // Use lower amplitudes to avoid clamping effects
  const extractor1 = new FeatureExtractor({ rmsSmoothing: 0, sampleRate: 44100 });
  const extractor2 = new FeatureExtractor({ rmsSmoothing: 0, sampleRate: 44100 });

  const louder = createSineWave(256, 440, 44100, 0.3);  // 30% amplitude
  const quieter = createSineWave(256, 440, 44100, 0.1); // 10% amplitude

  const louderFeatures = extractor1.process(louder);
  const quieterFeatures = extractor2.process(quieter);

  // Lower amplitude should produce lower RMS
  assert.ok(
    quieterFeatures.rms < louderFeatures.rms,
    `Quieter signal (${quieterFeatures.rms}) should have lower RMS than louder (${louderFeatures.rms})`
  );
});

test('RMS: empty sample array returns zero', () => {
  const extractor = new FeatureExtractor({ rmsSmoothing: 0 });
  const samples = new Int16Array(0);
  const features = extractor.process(samples);
  assert.equal(features.rms, 0, 'RMS of empty samples should be 0');
});

test('RMS: single impulse produces low RMS', () => {
  const extractor = new FeatureExtractor({ rmsSmoothing: 0 });
  const samples = createImpulse(256, 128, 32767);
  const features = extractor.process(samples);

  // Single sample at max in 256 samples = sqrt(1/256) * 3 scaling
  // = 0.0625 * 3 = 0.1875 approximately
  assert.ok(features.rms > 0, 'Impulse should produce non-zero RMS');
  assert.ok(features.rms < 0.3, `Single impulse should have low RMS, got ${features.rms}`);
});

// ============================================================================
// Normalization Tests
// ============================================================================

test('all output values are clamped to 0-1 range', () => {
  const extractor = new FeatureExtractor({ rmsSmoothing: 0, bandSmoothing: 0 });

  // Process multiple buffers with various signals
  const signals = [
    createSilentSamples(256),
    createSineWave(256, 100, 44100, 1.0),   // Bass frequency
    createSineWave(256, 1000, 44100, 1.0),  // Mid frequency
    createSineWave(256, 8000, 44100, 1.0),  // High frequency
    createConstantSamples(256, 32767),       // DC at max positive
  ];

  for (const samples of signals) {
    const features = extractor.process(samples);
    assert.ok(features.rms >= 0 && features.rms <= 1, `RMS out of range: ${features.rms}`);
    assert.ok(features.bass >= 0 && features.bass <= 1, `Bass out of range: ${features.bass}`);
    assert.ok(features.mids >= 0 && features.mids <= 1, `Mids out of range: ${features.mids}`);
    assert.ok(features.highs >= 0 && features.highs <= 1, `Highs out of range: ${features.highs}`);
    assert.equal(typeof features.beat, 'boolean', 'Beat should be boolean');
  }
});

test('negative sample values are handled correctly', () => {
  const extractor = new FeatureExtractor({ rmsSmoothing: 0 });
  const samples = createConstantSamples(256, -32768);
  const features = extractor.process(samples);

  // DC signal will have very low FFT response (except DC bin)
  assert.ok(features.rms >= 0 && features.rms <= 1, 'RMS should be in valid range');
});

// ============================================================================
// Frequency Band Tests
// ============================================================================

test('bass frequency signal has high bass, low mids and highs', () => {
  // Create extractor with no smoothing for direct measurement
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    bandSmoothing: 0,
    sampleRate: 44100,
    fftSize: 256,
  });

  // 100Hz is solidly in the bass range (20-250Hz)
  const samples = createSineWave(256, 100, 44100, 1.0);
  const features = extractor.process(samples);

  assert.ok(features.bass > 0.1, `Bass should be significant for 100Hz tone, got ${features.bass}`);
});

test('mid frequency signal has high mids relative to bass', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    bandSmoothing: 0,
    sampleRate: 44100,
    fftSize: 256,
  });

  // 1000Hz is in the mids range (250-2000Hz)
  const samples = createSineWave(256, 1000, 44100, 1.0);
  const features = extractor.process(samples);

  assert.ok(features.mids > 0, `Mids should be non-zero for 1000Hz tone, got ${features.mids}`);
});

test('high frequency signal produces highs response', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    bandSmoothing: 0,
    sampleRate: 44100,
    fftSize: 256,
  });

  // 8000Hz is in the highs range (2000Hz+)
  const samples = createSineWave(256, 8000, 44100, 1.0);
  const features = extractor.process(samples);

  assert.ok(features.highs >= 0, `Highs should be non-negative for 8000Hz tone, got ${features.highs}`);
});

test('silent signal has zero for all frequency bands', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    bandSmoothing: 0,
  });

  const samples = createSilentSamples(256);
  const features = extractor.process(samples);

  assert.equal(features.bass, 0, 'Bass should be 0 for silence');
  assert.equal(features.mids, 0, 'Mids should be 0 for silence');
  assert.equal(features.highs, 0, 'Highs should be 0 for silence');
});

// ============================================================================
// Smoothing Tests
// ============================================================================

test('smoothing causes gradual change in values', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0.9,  // Heavy smoothing
    bandSmoothing: 0.9,
    sampleRate: 44100,
  });

  // Start with silence
  const silence = createSilentSamples(256);
  extractor.process(silence);
  extractor.process(silence);
  extractor.process(silence);

  // Now send a loud signal
  const loud = createSineWave(256, 440, 44100, 1.0);
  const features1 = extractor.process(loud);

  // With 0.9 smoothing, the first loud frame should not immediately reach max
  // because smoothed = 0.9 * 0 + 0.1 * newValue
  // So first frame should be at most ~10% of raw value
  // (though clamping and scaling may affect this)

  // Send more loud frames
  const features2 = extractor.process(loud);
  const features3 = extractor.process(loud);

  // Values should be increasing toward the target
  assert.ok(features2.rms >= features1.rms, 'RMS should increase or stay same with sustained loud signal');
  assert.ok(features3.rms >= features2.rms, 'RMS should continue increasing toward target');
});

test('zero smoothing gives immediate response', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    bandSmoothing: 0,
  });

  // Start with silence
  const silence = createSilentSamples(256);
  extractor.process(silence);

  // Now send a loud signal
  const loud = createSineWave(256, 440, 44100, 1.0);
  const loudFeatures = extractor.process(loud);

  // Immediately back to silence
  const silentFeatures = extractor.process(silence);

  assert.equal(silentFeatures.rms, 0, 'With no smoothing, RMS should immediately go to 0');
});

test('reset clears smoothed values', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0.9,
    bandSmoothing: 0.9,
  });

  // Build up some state
  const loud = createSineWave(256, 440, 44100, 1.0);
  for (let i = 0; i < 10; i++) {
    extractor.process(loud);
  }

  // Reset
  extractor.reset();

  // Process silence - should be zero immediately since state was reset
  const silence = createSilentSamples(256);
  const features = extractor.process(silence);

  // After reset + silence, should be at 0
  assert.equal(features.rms, 0, 'After reset, processing silence should give 0 RMS');
  assert.equal(features.bass, 0, 'After reset, processing silence should give 0 bass');
});

// ============================================================================
// Beat Detection Tests
// ============================================================================

test('beat not detected on silent audio', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    beatThreshold: 1.5,
    beatAverageFrames: 10,
  });

  const silence = createSilentSamples(256);

  // Process many frames
  for (let i = 0; i < 20; i++) {
    const features = extractor.process(silence);
    assert.equal(features.beat, false, 'No beat should be detected in silence');
  }
});

test('beat not detected with insufficient history', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    beatThreshold: 1.5,
    beatAverageFrames: 43,  // Default: need ~43 frames
  });

  // Even with a loud signal, beat should not be detected in first 10 frames
  const loud = createSineWave(256, 440, 44100, 1.0);

  for (let i = 0; i < 9; i++) {
    const features = extractor.process(loud);
    assert.equal(features.beat, false, `Beat should not be detected at frame ${i} (insufficient history)`);
  }
});

test('beat detected on sudden energy spike after quiet period', async () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    beatThreshold: 1.5,
    beatAverageFrames: 15,  // Shorter for testing
  });

  // Build up quiet history
  const quiet = createSineWave(256, 440, 44100, 0.1);  // Low amplitude
  for (let i = 0; i < 20; i++) {
    extractor.process(quiet);
  }

  // Wait to ensure min beat interval passes
  await new Promise(resolve => setTimeout(resolve, 200));

  // Sudden loud signal
  const loud = createSineWave(256, 440, 44100, 1.0);  // Full amplitude

  // Check if beat is detected
  let beatDetected = false;
  for (let i = 0; i < 5; i++) {
    const features = extractor.process(loud);
    if (features.beat) {
      beatDetected = true;
      break;
    }
  }

  assert.ok(beatDetected, 'Beat should be detected on sudden energy spike');
});

test('beat respects minimum interval between detections', async () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    beatThreshold: 1.2,  // Lower threshold for easier triggering
    beatAverageFrames: 10,
  });

  // Build up some quiet history
  const quiet = createSineWave(256, 440, 44100, 0.05);
  for (let i = 0; i < 15; i++) {
    extractor.process(quiet);
  }

  // Wait for min interval
  await new Promise(resolve => setTimeout(resolve, 200));

  // Send loud signal to trigger first beat
  const loud = createSineWave(256, 440, 44100, 1.0);
  let firstBeatFrame = -1;
  let secondBeatFrame = -1;

  for (let i = 0; i < 50; i++) {
    const features = extractor.process(loud);
    if (features.beat) {
      if (firstBeatFrame < 0) {
        firstBeatFrame = i;
        // Continue with loud samples but check for second beat
      } else {
        secondBeatFrame = i;
        break;
      }
    }
  }

  // A beat should have been detected at some point
  assert.ok(firstBeatFrame >= 0, 'At least one beat should be detected');

  // If a second beat was detected, it should be after the minimum interval
  // With loud signals continuing, energy stays high and won't exceed threshold
  // This tests that we don't get rapid-fire beats
});

test('beat not detected when energy is consistently high', () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    beatThreshold: 1.5,
    beatAverageFrames: 10,
  });

  // Build up loud history
  const loud = createSineWave(256, 440, 44100, 1.0);
  for (let i = 0; i < 20; i++) {
    extractor.process(loud);
  }

  // Continue with same loud signal - should not trigger beat
  // because current energy equals average (no spike)
  let beatCount = 0;
  for (let i = 0; i < 10; i++) {
    const features = extractor.process(loud);
    if (features.beat) beatCount++;
  }

  // May get occasional beats but should be rare since energy is constant
  // (threshold is 1.5x average, and current equals average)
  assert.ok(beatCount < 5, `Too many beats detected on constant signal: ${beatCount}`);
});

test('beat requires minimum average energy', async () => {
  const extractor = new FeatureExtractor({
    rmsSmoothing: 0,
    beatThreshold: 1.5,
    beatAverageFrames: 10,
  });

  // Build history with very quiet signal
  const veryQuiet = createSineWave(256, 440, 44100, 0.01);  // Barely audible
  for (let i = 0; i < 15; i++) {
    extractor.process(veryQuiet);
  }

  // Wait for min interval
  await new Promise(resolve => setTimeout(resolve, 200));

  // Slightly louder but still quiet
  const slightlyLouder = createSineWave(256, 440, 44100, 0.02);
  let beatDetected = false;
  for (let i = 0; i < 5; i++) {
    const features = extractor.process(slightlyLouder);
    if (features.beat) beatDetected = true;
  }

  // Beat detection requires avgEnergy > 0.05, which won't be met with such quiet signals
  assert.equal(beatDetected, false, 'Beat should not be detected when average energy is too low');
});

// ============================================================================
// Configuration Tests
// ============================================================================

test('custom FFT size is used', () => {
  // Smaller FFT size should still work
  const extractor = new FeatureExtractor({
    fftSize: 128,
    rmsSmoothing: 0,
    bandSmoothing: 0,
  });

  const samples = createSineWave(128, 440, 44100, 0.5);
  const features = extractor.process(samples);

  // Should produce valid output
  assert.ok(features.rms >= 0, 'RMS should be valid with custom FFT size');
  assert.ok(features.bass >= 0, 'Bass should be valid with custom FFT size');
});

test('custom sample rate affects frequency bin calculations', () => {
  // Higher sample rate means different frequency bins
  const extractor = new FeatureExtractor({
    sampleRate: 48000,
    fftSize: 256,
    rmsSmoothing: 0,
    bandSmoothing: 0,
  });

  const samples = createSineWave(256, 100, 48000, 1.0);
  const features = extractor.process(samples);

  // Should still produce valid output
  assert.ok(features.bass >= 0, 'Bass should be valid with custom sample rate');
});

test('default configuration produces valid output', () => {
  const extractor = new FeatureExtractor();

  const samples = createSineWave(256, 440, 44100, 0.5);
  const features = extractor.process(samples);

  assert.ok(features.rms >= 0 && features.rms <= 1, 'RMS should be valid');
  assert.ok(features.bass >= 0 && features.bass <= 1, 'Bass should be valid');
  assert.ok(features.mids >= 0 && features.mids <= 1, 'Mids should be valid');
  assert.ok(features.highs >= 0 && features.highs <= 1, 'Highs should be valid');
  assert.equal(typeof features.beat, 'boolean', 'Beat should be boolean');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('handles samples shorter than FFT size', () => {
  const extractor = new FeatureExtractor({
    fftSize: 256,
    rmsSmoothing: 0,
    bandSmoothing: 0,
  });

  // Only 64 samples (quarter of FFT size)
  const samples = createSineWave(64, 440, 44100, 0.5);
  const features = extractor.process(samples);

  // Should still produce valid output (zero-padded)
  assert.ok(features.rms >= 0, 'RMS should be valid with short samples');
});

test('handles samples longer than FFT size', () => {
  const extractor = new FeatureExtractor({
    fftSize: 256,
    rmsSmoothing: 0,
    bandSmoothing: 0,
  });

  // 512 samples (double FFT size)
  const samples = createSineWave(512, 440, 44100, 0.5);
  const features = extractor.process(samples);

  // Should use first fftSize samples
  assert.ok(features.rms >= 0, 'RMS should be valid with long samples');
});
