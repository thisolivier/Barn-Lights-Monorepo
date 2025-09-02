# Fixtures

Helper scripts used by the test suite.

- `renderer_stream.mjs` emits a short sequence of frames including malformed lines.
- `renderer_crash.mjs` simulates a renderer that exits with an error.
- `renderer_loop.mjs` continuously streams frames from a sample NDJSON file.
- `renderer_preamble.mjs` prints startup messages before emitting the first frame.
- `renderer_reboot.mjs` outputs a timestamped frame followed by a reboot request frame.
- `decode-sample-frame.mjs` decodes the first sample frame into a run buffer.
- `adapt-sample.mjs` rewrites renderer samples so that section lengths match the layout.
