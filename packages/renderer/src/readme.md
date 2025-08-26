# Source modules

Core runtime code for BarnLights Playbox:

- `engine.mjs` – render loop emitting SLICES_NDJSON and exposing live `params` such as `wallMode` (`duplicate` | `independent` | `extend`) for left/right rendering.
- `server.mjs` – HTTP/WebSocket server serving the UI and applying param updates.
- `effects/` – effect implementations, registry and post-processing helpers.
- `ui/` – browser UI for preview and controls, can modify the `params` which the engine renders.

## A note on the engine's use of effects

Effects are plugins that declare their own controls and are selected via `params.effect`.
Their values live in `params.effects[effectId]`.
Post-processing modifiers run afterwards via a pipeline defined in `effects/post.mjs`.
Additional modifiers can be registered using `registerPostModifier` to extend the pipeline.
