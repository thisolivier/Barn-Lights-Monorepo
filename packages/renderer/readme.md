# BarnLights Playbox (test harness)

Minimal Node + browser setup that:
- renders gradients / solid / fire onto a 2D virtual scene,
- applies strobe / brightness / tint / pitch/yaw transforms / gamma,
- samples per your layout JSON into per-row "slices",
- **emits SLICES_NDJSON to stdout** (one line per frame),
- serves a **live preview** with a light barn perspective and per-LED colored dots.

## Architecture
- `bin/engine.mjs` launches the HTTP server and invokes the engine's `start` function, streaming NDJSON frames.
- `src/engine.mjs` renders frames and exposes live parameters.
- `src/server.mjs` exports a `startServer` helper that serves the UI and relays WebSocket param updates.
- `src/ui/` contains the browser preview and controls.

Runtime parameters are grouped under `effects` for effect-specific settings
and `post` for modifiers like brightness, tint and strobe which can be applied on top.
A single scene is rendered each frame and copied to both walls.

## Frame pipeline
1. The engine renders the active effect into a floating point RGB buffer (`leftFrame`).
2. Post-processing modifiers run on that buffer and the result is duplicated to `rightFrame`.
3. Each frame is sliced according to the configured layouts and emitted as base64-encoded `rgb8` NDJSON.
4. The browser preview reuses these frame buffers to draw the scene and per-LED indicators.

## Quick start
1. Open your terminal
2. Navigate to this directory
3. Execute the commands (node v20-22 required)
```bash
npm install
npm start
```
4.  Go to `localhost:8080` in your browser

## Running tests
```bash
npm test
```

## Acknowledgements
OpenAI's Codex, you are a boss. Welcome to the age of software on demand.
