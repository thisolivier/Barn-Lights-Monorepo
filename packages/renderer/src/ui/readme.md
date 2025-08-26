# UI

Browser interface providing live preview and controls.

- `index.html` – control layout and canvas elements grouped into General, Strobe and Tint sections.
- `main.mjs` – entry point for JS logic, wiring modules together, exposes a 'run' function.
- `connection.mjs` – WebSocket setup and message handling.
- `ui-controls.mjs` – reads and updates effect controls.
- `renderer.mjs` – scene generation and drawing (relies on render functions within each effect).

`ui-controls.mjs` now interacts with namespaced params (`effects` and `post`).
