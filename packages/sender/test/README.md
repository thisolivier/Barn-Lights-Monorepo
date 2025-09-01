# Tests

Integration and unit tests for the Barn Lights UDP Sender. The tests run with Node's built-in test runner and exercise both individual modules and end-to-end behavior.

## Fixtures
- `renderer_stream.mjs` emits a short sequence of frames including malformed lines.
- `renderer_crash.mjs` simulates a renderer that exits with an error.
- `renderer_loop.mjs` continuously streams frames from `config/input-sample.txt` for integration testing.
- `renderer_preamble.mjs` prints startup messages before emitting the first frame to test preamble handling.
- `decode-sample-frame.mjs` decodes the first sample frame into a run buffer for assertions.

## Test Files
- `assembler.test.mjs` verifies frame assembly logic.
- `cli-layout.test.mjs` covers CLI layout handling.
- `cli-config.test.mjs` verifies configuration validation logic.
- `cli.test.mjs` ensures the command-line interface starts and stops cleanly.
- `integration.test.mjs` runs a mock renderer in a loop and validates the full pipeline through UDP transmission.
- `layout.test.mjs` checks layout validation.
- `renderer-process.test.mjs` exercises renderer spawning and NDJSON ingestion.
- `telemetry-errors.test.mjs` verifies throttled error reporting.
