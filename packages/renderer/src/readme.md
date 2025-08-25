# Source modules

Core runtime code for BarnLights Playbox:

 - `engine.mjs` – render loop emitting SLICES_NDJSON and exposing live `params`.
 - `server.mjs` – HTTP/WebSocket server serving the UI and applying param updates.
 - `effects/` – effect implementations, registry and shared modifiers.
 - `ui/` – browser UI for preview and controls.
