# Source modules

Core runtime code for BarnLights Playbox:

- `engine.mjs` – render loop emitting SLICES_NDJSON and exposing live `params`.
- `server.mjs` – HTTP/WebSocket server serving the UI and applying param updates.
- `effects.mjs` – effect generators and post-processing helpers.
- `ui/` – browser UI for preview and controls.
