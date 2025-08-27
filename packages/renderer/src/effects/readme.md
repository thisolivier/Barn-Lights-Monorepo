# Effects

Effect modules and utilities for the renderer.

- `library/` – individual effect implementations (e.g. gradient, solid, noise, digitalRain, diagonalStripes).
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
