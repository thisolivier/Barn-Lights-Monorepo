# UI

Browser interface providing live preview and controls.

- `index.html` – control layout and canvas elements grouped into Effect, General, Orientation, Strobe and Tint sections. Pitch and yaw speed sliders live under Orientation while editable numeric inputs allow setting their absolute angles in degrees and zeroing the respective speeds. The effect selector is populated at runtime from the shared effects map.
- `main.mjs` – entry point for JS logic, wiring modules together, exposes a 'run' function.
- `connection.mjs` – WebSocket setup and message handling.
- `controls-logic.mjs` – wires DOM controls to params and renders effect-specific widgets.
- `preview-renderer.mjs` – scene generation and drawing, duplicating a single scene to both canvases.
- `presets.mjs` – handles saving/retreiving configuration and listing the saved options.
- `subviews/` – reusable widgets and `renderControls` helper.