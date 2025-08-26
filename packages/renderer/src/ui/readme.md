# UI

Browser interface providing live preview and controls.

- `index.html` – control layout and canvas elements grouped into Effect, General, Strobe and Tint sections.
- `main.mjs` – entry point for JS logic, wiring modules together, exposes a 'run' function.
- `connection.mjs` – WebSocket setup and message handling.
- `ui-controls.mjs` – wires DOM controls to params and renders effect-specific widgets.
- `controls/` – reusable widgets and `renderControls` helper.
- `renderer.mjs` – scene generation and drawing, duplicating a single scene to both canvases. The preview dims non-pixel areas while showing LED samples in fully saturated, bright colors for clearer contrast.

The UI now includes a `fireShader` effect with adjustable speed, angle, flame height, and color gradient. Gradient controls use the Grapick picker for draggable color stops and custom palettes.

`ui-controls.mjs` now interacts with namespaced params (`effects` and `post`).
