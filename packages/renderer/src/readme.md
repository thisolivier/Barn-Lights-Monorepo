# Source modules

Core runtime code for BarnLights Playbox:

- `engine.mjs` – side‑effect‑free render loop exposing `params`; call `start()` to emit SLICES_NDJSON.
- `server.mjs` – HTTP/WebSocket server serving the UI and applying param updates.
- `effects/` – effect implementations, registry and post-processing helpers.
- `ui/` – browser UI for preview and controls, can modify the `params` which the engine renders.

## A note on the engine's use of effects

Effects are plugins that declare their own controls and are selected via `params.effect`.
Their values live in `params.effects[effectId]`.
Post-processing modifiers run afterwards via a pipeline defined in `effects/post.mjs`.
Additional modifiers can be registered using `registerPostModifier` to extend the pipeline.
