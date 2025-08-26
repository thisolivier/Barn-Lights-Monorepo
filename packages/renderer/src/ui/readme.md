# UI

Browser interface providing live preview and controls.

- `index.html` – control layout and canvas elements grouped into Effect, General, Strobe and Tint sections. The General section now includes pitch and yaw sliders for directional control.
- `main.mjs` – entry point for JS logic, wiring modules together, exposes a 'run' function.
- `connection.mjs` – WebSocket setup and message handling.
- `ui-controls.mjs` – wires DOM controls to params and renders effect-specific widgets.
- `controls/` – reusable widgets and `renderControls` helper.
- `renderer.mjs` – scene generation and drawing, duplicating a single scene to both canvases.
