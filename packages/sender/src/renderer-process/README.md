# Renderer Process

Spawns an external renderer and emits `FrameIngest` events for each NDJSON frame produced on stdout. Any output from the renderer is ignored until a line beginning with `{"ts` is received, allowing startup messages to be printed without affecting the stream.

If a working directory (`cwd`) is specified in the renderer configuration, the module verifies that the directory exists before spawning and emits an `error` event if it is missing.

