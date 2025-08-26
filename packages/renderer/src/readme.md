# Source modules

Core runtime code for BarnLights Playbox:

- `engine.mjs` – render loop emitting SLICES_NDJSON and exposing live `params`.
- `server.mjs` – HTTP/WebSocket server serving the UI and applying param updates.
- `effects/` – effect implementations, registry and shared modifiers.
- `ui/` – browser UI for preview and controls, can modify the `params` which the engine renders.

# A note on the engine's use of effects

Effects are like little plugins, they declare their own controls and these are rendered depending on what effect you choose.
Their values are encoded in a nested field of `params`. Shared effects are applied after/ontop of the plugin effects and include strobe, tint, and brightness - there are primary keys in `params`& always present.