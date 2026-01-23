# Renderer Process

Spawns an external renderer and emits `FrameIngest` events for each NDJSON frame produced on stdout. Any output from the renderer is ignored until a line beginning with `{"ts` is received, allowing startup messages to be printed without affecting the stream. The module also listens for special control frames like `{ "reboot": true, "side": "left" }` and emits a `Reboot` event with the side name when encountered.

If a working directory (`cwd`) is specified in the renderer configuration, the module verifies that the directory exists before spawning and emits an `error` event if it is missing.

