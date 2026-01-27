/**
 * Audio Package Entry Point
 *
 * Wires together audio capture, feature extraction, and WebSocket sending
 * to provide audio-reactive data to the LED renderer.
 *
 * This is a standalone process that:
 * 1. Captures audio from the system default input device
 * 2. Extracts musical features (RMS, frequency bands, beats)
 * 3. Sends features to the renderer via WebSocket at 60Hz
 */

import { AudioCapture, listInputDevices } from './capture.js';
import { FeatureExtractor, AudioFeatures } from './features.js';
import { AudioSender } from './sender.js';

// Re-export for external use
export { AudioCapture, listInputDevices } from './capture.js';
export { FeatureExtractor, AudioFeatures } from './features.js';
export { AudioSender } from './sender.js';

/** Audio pipeline configuration */
interface PipelineConfig {
  /** WebSocket URL for renderer connection */
  wsUrl?: string;
  /** Show verbose logging */
  verbose?: boolean;
}

/**
 * Main audio pipeline class that orchestrates capture -> features -> send.
 */
class AudioPipeline {
  private capture: AudioCapture;
  private extractor: FeatureExtractor;
  private sender: AudioSender;
  private verbose: boolean;
  private frameCount = 0;

  constructor(config: PipelineConfig = {}) {
    this.verbose = config.verbose ?? false;

    // Initialize components
    this.capture = new AudioCapture({
      sampleRate: 44100,
      bufferSize: 256,
      channels: 1,
      bitDepth: 16,
    });

    this.extractor = new FeatureExtractor({
      sampleRate: 44100,
      fftSize: 256,
    });

    this.sender = new AudioSender({
      url: config.wsUrl ?? 'ws://localhost:8080',
      sendRate: 60,
    });

    // Wire up the pipeline
    this.capture.on('data', (samples: Int16Array) => {
      this.processAudio(samples);
    });

    this.capture.on('error', (err: Error) => {
      console.error('[audio] Capture error:', err.message);
    });
  }

  /**
   * Process incoming audio samples.
   */
  private processAudio(samples: Int16Array): void {
    // Extract features
    const features = this.extractor.process(samples);

    // Send to renderer
    this.sender.send(features);

    // Verbose logging (every ~60 frames = ~1 second)
    if (this.verbose) {
      this.frameCount++;
      if (this.frameCount % 60 === 0) {
        this.logFeatures(features);
      }
    }
  }

  /**
   * Log current feature values for debugging.
   */
  private logFeatures(features: AudioFeatures): void {
    const bar = (value: number, width = 20) => {
      const filled = Math.round(value * width);
      return '[' + '='.repeat(filled) + ' '.repeat(width - filled) + ']';
    };

    console.log(
      `[audio] RMS: ${bar(features.rms)} Bass: ${bar(features.bass)} ` +
        `Mids: ${bar(features.mids)} Highs: ${bar(features.highs)} ` +
        `Beat: ${features.beat ? '!' : '-'}`
    );
  }

  /**
   * Start the audio pipeline.
   */
  start(): void {
    console.log('[audio] Starting audio pipeline...');

    // List available devices
    const devices = listInputDevices();
    console.log('[audio] Available input devices:');
    devices.forEach((d) => {
      console.log(`  - [${d.id}] ${d.name} (${d.maxInputChannels} channels)`);
    });

    // Connect WebSocket sender
    this.sender.connect();

    // Start audio capture
    this.capture.start();

    console.log('[audio] Pipeline running. Press Ctrl+C to stop.');
  }

  /**
   * Stop the audio pipeline and release resources.
   */
  stop(): void {
    console.log('[audio] Stopping audio pipeline...');
    this.capture.stop();
    this.sender.disconnect();
    console.log('[audio] Pipeline stopped.');
  }
}

// ============================================================================
// Main entry point when run directly
// ============================================================================

function main(): void {
  console.log('='.repeat(60));
  console.log('LED Lights Audio Capture');
  console.log('='.repeat(60));

  // Parse command line arguments
  const args = process.argv.slice(2);
  const verbose = args.includes('-v') || args.includes('--verbose');
  const wsUrl = getArgValue(args, '--ws') ?? 'ws://localhost:8080';

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  // Create and start pipeline
  const pipeline = new AudioPipeline({
    wsUrl,
    verbose,
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\n[audio] Shutting down...');
    pipeline.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('[audio] Uncaught exception:', err);
    pipeline.stop();
    process.exit(1);
  });

  // Start the pipeline
  pipeline.start();
}

/**
 * Get value for a command line argument.
 */
function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
}

/**
 * Print help message.
 */
function printHelp(): void {
  console.log(`
Usage: npm start [options]

Options:
  -v, --verbose     Enable verbose logging (show feature values)
  --ws <url>        WebSocket URL (default: ws://localhost:8080)
  -h, --help        Show this help message

Description:
  Captures audio from the system default input device, extracts
  musical features (RMS, frequency bands, beat detection), and
  sends them to the LED renderer via WebSocket.

  For system audio capture on macOS, you'll need a loopback device
  like BlackHole or Loopback.

Examples:
  npm start                    # Start with defaults
  npm start -v                 # Start with verbose logging
  npm start --ws ws://pi:8080  # Connect to remote renderer
`);
}

// Run main when this module is executed directly
main();
