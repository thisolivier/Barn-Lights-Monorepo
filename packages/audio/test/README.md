# Audio Package Tests

Automated tests for the LED Lights audio capture and feature extraction module.

## Test Files

- `features.test.mjs` - Tests for the FeatureExtractor class (25 tests)
  - RMS (Root Mean Square) calculation with known input values
  - Frequency band separation (bass, mids, highs) via FFT
  - Beat detection threshold logic
  - Normalization of output values to 0-1 range
  - Exponential smoothing behavior
  - Configuration options and edge cases

- `sender.test.mjs` - Tests for the AudioSender WebSocket client (12 tests)
  - Message format correctness (type, rms, bass, mids, highs, beat)
  - Rate limiting behavior
  - Connection state management
  - Graceful shutdown behavior

- `capture.test.mjs` - Tests for the AudioCapture module patterns (25 tests)
  - Mock implementation matching real AudioCapture behavior
  - Configuration handling (sample rate, buffer size, channels)
  - Event emission (data, error, start, stop)
  - Buffer conversion (Buffer to Int16Array)
  - Device selection logic

## Running Tests

```bash
# Run all tests (compiles TypeScript first)
npm test

# Run a specific test file
node --test test/features.test.mjs

# Run tests with single concurrency (useful for debugging)
node --test --test-concurrency=1 test/*.test.mjs
```

## Test Structure

Tests use Node.js built-in test runner (`node:test`) with strict assertions
(`assert/strict`), following the monorepo's testing conventions.

### Mocking Strategy

- **FeatureExtractor**: Tested directly using synthetic audio samples
  (sine waves, impulses, silence) without requiring audio hardware.

- **AudioSender**: Tested with mock WebSocket servers (`ws.WebSocketServer`)
  to verify message format and connection behavior. Tests include explicit
  timeouts to prevent hanging.

- **AudioCapture**: Uses a MockAudioCapture class that replicates the real
  implementation's behavior without requiring naudiodon/PortAudio. This avoids
  SIGSEGV crashes in environments without audio hardware.

## Test Helpers

- `helpers/timeout.mjs` - Utility for adding timeouts to promises,
  preventing tests from hanging indefinitely.

## Notes

- Tests require TypeScript compilation before running (`npm run pretest`
  handles this automatically).
- The sender tests start mock WebSocket servers on random ports to avoid
  conflicts.
- Beat detection tests include small delays (200ms) to account for the
  minimum beat interval constraint.
- Capture tests use mock implementations to avoid naudiodon crashes in
  environments without audio hardware.
