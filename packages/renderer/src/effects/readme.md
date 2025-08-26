# Effects

Effect modules and utilities for the renderer.

- `library/` – individual effect implementations (e.g. gradient, solid, fire).
- `index.mjs` – aggregates the library into an `effects` map keyed by id.
- `modifiers.mjs` – shared modifiers and sampling helpers.
- `post.mjs` – post-processing pipeline and modifier registration.

Each effect contains its own render function and declares its modifiable parameters. 
Modifiers, or "post" effects, are commonly available to be applied on top of any plugin effect.
