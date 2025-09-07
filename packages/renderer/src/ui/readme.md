# UI

Browser interface providing a live preview above a panel of controls.


- `index.html` – UI control layout and visual effect preview. The "General" panel includes checkboxes to persist brightness, gamma, FPS cap and render mode when switching effects or presets.
- `main.mjs` – entry point for JS logic, wiring modules together, exposes a 'run' function.
- `connection.mjs` – WebSocket setup and message handling.
- `controls-logic.mjs` – wires DOM controls to params and renders effect-specific widgets.
- `renderer.mjs` – uses `renderFrames` to draw the scene for both walls and overlay per-LED indicators.
- `reboot.mjs` – issues reboot commands for individual receivers and repeats them every frame for a short duration.
- `presets.mjs` – handles saving/retreiving configuration and listing the saved options with thumbnails.
- `subviews/` – reusable widgets and `renderControls` helper.
