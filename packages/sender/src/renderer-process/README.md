# Renderer Process

Spawns an external renderer and emits `FrameIngest` events for each NDJSON frame produced on stdout.
If a working directory (`cwd`) is specified in the renderer configuration, the module verifies that the directory exists before spawning and emits an `error` event if it is missing.
