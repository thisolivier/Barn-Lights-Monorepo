# Effects

Effect modules and utilities for the renderer.

- `library/` – individual effect implementations (e.g. gradient, solid, fire, fireShader).
- `index.mjs` – aggregates the library into an `effects` map keyed by id.
- `modifiers.mjs` – shared modifiers and sampling helpers.
- `post.mjs` – post-processing pipeline and modifier registration.


Each effect contains its own render function and declares its modifiable parameters.
Modifiers, or "post" effects, are commonly available to be applied on top of any plugin effect.

Effects receive a `side` argument of `"left"`, `"right"` or `"both"` along with the
scene dimensions. When `wallMode` is set to `"extend"`, the engine calls an
effect's render function once with a width of `SCENE_W*2` and `side` set to
`"both"`. Use this to span visuals seamlessly across the two walls.
