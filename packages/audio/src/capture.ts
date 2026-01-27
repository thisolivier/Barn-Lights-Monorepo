/**
 * Audio Capture Module
 *
 * Captures audio from the system default input device using naudiodon (PortAudio bindings).
 * Emits PCM data buffers for feature extraction.
 */

import { EventEmitter } from 'events';
import portAudio from 'naudiodon';

/** Audio capture configuration */
export interface CaptureConfig {
  /** Sample rate in Hz (default: 44100) */
  sampleRate: number;
  /** Buffer size in samples (default: 256 for low latency) */
  bufferSize: number;
  /** Number of channels (default: 1 for mono) */
  channels: number;
  /** Bits per sample (default: 16) */
  bitDepth: number;
}

/** Default capture configuration optimized for low latency */
const DEFAULT_CONFIG: CaptureConfig = {
  sampleRate: 44100,
  bufferSize: 256, // ~5.8ms latency at 44.1kHz
  channels: 1,
  bitDepth: 16,
};

/** Events emitted by AudioCapture */
export interface AudioCaptureEvents {
  /** Emitted when new PCM data is available */
  data: (samples: Int16Array) => void;
  /** Emitted on capture errors */
  error: (error: Error) => void;
  /** Emitted when capture starts */
  start: () => void;
  /** Emitted when capture stops */
  stop: () => void;
}

/**
 * Audio capture class that wraps naudiodon for real-time audio input.
 *
 * Usage:
 * ```typescript
 * const capture = new AudioCapture();
 * capture.on('data', (samples) => {
 *   // Process 16-bit PCM samples
 * });
 * capture.start();
 * ```
 */
export class AudioCapture extends EventEmitter {
  private config: CaptureConfig;
  private audioInput: portAudio.IoStreamRead | null = null;
  private isRunning = false;

  constructor(config: Partial<CaptureConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start capturing audio from the default input device.
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    try {
      // Get default input device
      const devices = portAudio.getDevices();
      const defaultInput = devices.find((d) => d.maxInputChannels > 0);

      if (!defaultInput) {
        throw new Error('No audio input device found');
      }

      console.log(`[audio] Using input device: ${defaultInput.name}`);

      // Create audio input stream
      this.audioInput = portAudio.AudioIO({
        inOptions: {
          channelCount: this.config.channels,
          sampleFormat: portAudio.SampleFormat16Bit,
          sampleRate: this.config.sampleRate,
          deviceId: defaultInput.id,
          framesPerBuffer: this.config.bufferSize,
        },
      }) as portAudio.IoStreamRead;

      // Handle incoming audio data
      this.audioInput.on('data', (buffer: Buffer) => {
        // Convert Buffer to Int16Array (16-bit signed PCM)
        const samples = new Int16Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.length / 2
        );
        this.emit('data', samples);
      });

      // Handle errors
      this.audioInput.on('error', (err: Error) => {
        console.error('[audio] Capture error:', err.message);
        this.emit('error', err);
      });

      // Start the stream
      this.audioInput.start();
      this.isRunning = true;
      console.log(
        `[audio] Capture started (${this.config.sampleRate}Hz, ${this.config.bufferSize} samples/buffer)`
      );
      this.emit('start');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[audio] Failed to start capture:', error.message);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop audio capture and release resources.
   */
  stop(): void {
    if (!this.isRunning || !this.audioInput) {
      return;
    }

    try {
      this.audioInput.quit();
      this.audioInput = null;
      this.isRunning = false;
      console.log('[audio] Capture stopped');
      this.emit('stop');
    } catch (err) {
      console.error('[audio] Error stopping capture:', err);
    }
  }

  /**
   * Check if capture is currently running.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get the current capture configuration.
   */
  getConfig(): CaptureConfig {
    return { ...this.config };
  }
}

/**
 * List available audio input devices.
 */
export function listInputDevices(): Array<{
  id: number;
  name: string;
  maxInputChannels: number;
}> {
  const devices = portAudio.getDevices();
  return devices
    .filter((d) => d.maxInputChannels > 0)
    .map((d) => ({
      id: d.id,
      name: d.name,
      maxInputChannels: d.maxInputChannels,
    }));
}
