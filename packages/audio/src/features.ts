/**
 * Audio Feature Extraction Module
 *
 * Extracts audio features from PCM samples:
 * - RMS (Root Mean Square) - overall volume level
 * - Frequency bands (bass, mids, highs) via FFT
 * - Beat detection based on energy threshold
 *
 * All output values are normalized to 0.0 - 1.0 range.
 */

import FFT from 'fft.js';

/** Extracted audio features, all normalized to 0.0 - 1.0 */
export interface AudioFeatures {
  /** RMS (volume) level */
  rms: number;
  /** Bass frequency band (20-250Hz) */
  bass: number;
  /** Mid frequency band (250-2000Hz) */
  mids: number;
  /** High frequency band (2000Hz+) */
  highs: number;
  /** Beat detected this frame */
  beat: boolean;
}

/** Feature extractor configuration */
export interface FeatureConfig {
  /** Sample rate in Hz */
  sampleRate: number;
  /** FFT size (must be power of 2) */
  fftSize: number;
  /** Exponential smoothing factor for RMS (0.0 - 1.0) */
  rmsSmoothing: number;
  /** Exponential smoothing factor for frequency bands */
  bandSmoothing: number;
  /** Beat detection threshold multiplier (vs rolling average) */
  beatThreshold: number;
  /** Number of frames for beat energy averaging */
  beatAverageFrames: number;
}

const DEFAULT_CONFIG: FeatureConfig = {
  sampleRate: 44100,
  fftSize: 256,
  rmsSmoothing: 0.8, // Higher = more smoothing
  bandSmoothing: 0.7,
  beatThreshold: 1.5, // Beat triggers at 1.5x average energy
  beatAverageFrames: 43, // ~0.7 seconds at 60Hz
};

// Frequency band boundaries in Hz
const BASS_LOW = 20;
const BASS_HIGH = 250;
const MIDS_LOW = 250;
const MIDS_HIGH = 2000;
const HIGHS_LOW = 2000;
// Highs extend to Nyquist frequency

/**
 * Audio feature extractor class.
 *
 * Processes PCM samples and extracts musical features for visualization.
 *
 * Usage:
 * ```typescript
 * const extractor = new FeatureExtractor();
 * const features = extractor.process(samples);
 * console.log(features.rms, features.beat);
 * ```
 */
export class FeatureExtractor {
  private config: FeatureConfig;
  private fft: FFT;

  // Smoothed output values
  private smoothedRms = 0;
  private smoothedBass = 0;
  private smoothedMids = 0;
  private smoothedHighs = 0;

  // Beat detection state
  private energyHistory: number[] = [];
  private lastBeatTime = 0;
  private minBeatInterval = 150; // Minimum ms between beats

  // Pre-allocated FFT buffers
  private fftInput: number[];
  private fftOutput: number[];

  // Frequency bin indices for each band
  private bassEndBin: number;
  private midsEndBin: number;

  constructor(config: Partial<FeatureConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize FFT
    this.fft = new FFT(this.config.fftSize);
    this.fftInput = new Array(this.config.fftSize).fill(0);
    this.fftOutput = this.fft.createComplexArray();

    // Calculate frequency bin boundaries
    const binWidth = this.config.sampleRate / this.config.fftSize;
    this.bassEndBin = Math.floor(BASS_HIGH / binWidth);
    this.midsEndBin = Math.floor(MIDS_HIGH / binWidth);
  }

  /**
   * Process a buffer of PCM samples and extract features.
   *
   * @param samples - Int16Array of 16-bit signed PCM samples
   * @returns Extracted audio features (normalized 0.0 - 1.0)
   */
  process(samples: Int16Array): AudioFeatures {
    // Calculate raw RMS
    const rawRms = this.calculateRms(samples);

    // Apply exponential smoothing to RMS
    this.smoothedRms =
      this.config.rmsSmoothing * this.smoothedRms +
      (1 - this.config.rmsSmoothing) * rawRms;

    // Perform FFT and extract frequency bands
    const { bass, mids, highs } = this.extractBands(samples);

    // Smooth frequency bands
    this.smoothedBass =
      this.config.bandSmoothing * this.smoothedBass +
      (1 - this.config.bandSmoothing) * bass;
    this.smoothedMids =
      this.config.bandSmoothing * this.smoothedMids +
      (1 - this.config.bandSmoothing) * mids;
    this.smoothedHighs =
      this.config.bandSmoothing * this.smoothedHighs +
      (1 - this.config.bandSmoothing) * highs;

    // Detect beat
    const beat = this.detectBeat(rawRms);

    return {
      rms: this.clamp(this.smoothedRms),
      bass: this.clamp(this.smoothedBass),
      mids: this.clamp(this.smoothedMids),
      highs: this.clamp(this.smoothedHighs),
      beat,
    };
  }

  /**
   * Calculate RMS (Root Mean Square) of samples.
   * Returns normalized value 0.0 - 1.0 based on 16-bit range.
   */
  private calculateRms(samples: Int16Array): number {
    if (samples.length === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      // Normalize to -1.0 to 1.0 range
      const normalized = samples[i] / 32768;
      sumSquares += normalized * normalized;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    // Scale RMS to make typical audio levels more visible
    // RMS of full-scale sine wave is ~0.707, typical speech/music is 0.1-0.3
    return Math.min(1.0, rms * 3);
  }

  /**
   * Extract frequency band energies using FFT.
   */
  private extractBands(samples: Int16Array): {
    bass: number;
    mids: number;
    highs: number;
  } {
    // Copy and normalize samples to FFT input buffer
    const len = Math.min(samples.length, this.config.fftSize);
    for (let i = 0; i < len; i++) {
      this.fftInput[i] = samples[i] / 32768;
    }
    // Zero-pad if samples are shorter than FFT size
    for (let i = len; i < this.config.fftSize; i++) {
      this.fftInput[i] = 0;
    }

    // Apply Hann window to reduce spectral leakage
    for (let i = 0; i < this.config.fftSize; i++) {
      const window =
        0.5 * (1 - Math.cos((2 * Math.PI * i) / (this.config.fftSize - 1)));
      this.fftInput[i] *= window;
    }

    // Perform FFT
    this.fft.realTransform(this.fftOutput, this.fftInput);

    // Calculate magnitude spectrum and sum bands
    let bassSum = 0;
    let midsSum = 0;
    let highsSum = 0;
    let bassCount = 0;
    let midsCount = 0;
    let highsCount = 0;

    // Only process positive frequencies (first half of FFT output)
    const nyquist = this.config.fftSize / 2;
    for (let i = 1; i < nyquist; i++) {
      // Complex magnitude: sqrt(re^2 + im^2)
      const re = this.fftOutput[2 * i];
      const im = this.fftOutput[2 * i + 1];
      const magnitude = Math.sqrt(re * re + im * im);

      if (i <= this.bassEndBin) {
        bassSum += magnitude;
        bassCount++;
      } else if (i <= this.midsEndBin) {
        midsSum += magnitude;
        midsCount++;
      } else {
        highsSum += magnitude;
        highsCount++;
      }
    }

    // Average and normalize each band
    // Scaling factors tuned empirically for typical music
    const bass = bassCount > 0 ? (bassSum / bassCount) * 8 : 0;
    const mids = midsCount > 0 ? (midsSum / midsCount) * 12 : 0;
    const highs = highsCount > 0 ? (highsSum / highsCount) * 16 : 0;

    return { bass, mids, highs };
  }

  /**
   * Detect beats based on energy threshold vs rolling average.
   *
   * TODO: This is an extension point for future sensitivity slider.
   * The beatThreshold config value could be exposed to UI for user adjustment.
   * Consider adding: attack/decay parameters, frequency-weighted detection,
   * and adaptive threshold based on music dynamics.
   */
  private detectBeat(currentEnergy: number): boolean {
    // Add current energy to history
    this.energyHistory.push(currentEnergy);

    // Keep history at configured length
    while (this.energyHistory.length > this.config.beatAverageFrames) {
      this.energyHistory.shift();
    }

    // Need enough history for meaningful average
    if (this.energyHistory.length < 10) {
      return false;
    }

    // Calculate rolling average
    const avgEnergy =
      this.energyHistory.reduce((a, b) => a + b, 0) /
      this.energyHistory.length;

    // Check if current energy exceeds threshold
    const now = Date.now();
    const exceedsThreshold =
      currentEnergy > avgEnergy * this.config.beatThreshold;
    const enoughTimePassed = now - this.lastBeatTime > this.minBeatInterval;

    if (exceedsThreshold && enoughTimePassed && avgEnergy > 0.05) {
      this.lastBeatTime = now;
      return true;
    }

    return false;
  }

  /**
   * Clamp value to 0.0 - 1.0 range.
   */
  private clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  /**
   * Reset all smoothed values and history.
   */
  reset(): void {
    this.smoothedRms = 0;
    this.smoothedBass = 0;
    this.smoothedMids = 0;
    this.smoothedHighs = 0;
    this.energyHistory = [];
    this.lastBeatTime = 0;
  }
}
