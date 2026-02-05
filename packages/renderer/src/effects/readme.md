# Effects

Effect modules and utilities for the renderer.

- `library/` – individual effect implementations (e.g. gradient, solid, noise, digitalRain, diagonalStripes, gif).
- `index.mjs` – aggregates the library into an `effects` map keyed by id.
- `modifiers.mjs` – shared modifiers and sampling helpers, including pitch/yaw transforms.
  Provides both clamped (`bilinearSampleRGB`) and wrapping (`bilinearSampleWrapRGB`) bilinear sampling.
- `post.mjs` – post-processing pipeline and modifier registration; respects manual pitch/yaw angles when speeds are zero.

The `transformScene` helper uses wrapping bilinear sampling so that shifts and rotations 
loop seamlessly across scene edges.

Each effect contains its own render function and declares its modifiable parameters.
Modifiers, or "post" effects, are commonly available to be applied on top of any plugin effect.
Effects render into a single virtual scene using the signature
`(sceneF32, W, H, t, params)`. The engine copies this scene to both walls.

## GIF Effect

The GIF effect (`library/gif.mjs`) includes a built-in GIF parser and frame cache.
The server pre-caches GIF data via `loadGifFromPath()` in the engine.
In the browser preview, the same module self-heals cache misses by fetching GIF
files from the `/gif/` HTTP endpoint, so no UI components need GIF-specific logic.
Because effects are bundled into `bundle.js` by webpack, `npm run build:ui` must
be re-run after any changes to effect source files.
