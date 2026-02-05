# Subviews

Dynamic UI widgets for effect parameters.

- `index.mjs` – exports `renderControls` which builds form elements from a schema.
- `number.mjs` – slider/number input.
- `checkbox.mjs` – boolean toggle.
- `button.mjs` – sends a boolean toggle on click.
- `enum.mjs` – dropdown selector.
- `color.mjs` – RGB color picker.
- `colorStops.mjs` – wraps the Grapick gradient picker for draggable color/position stops and syncs on handler events.
- `filePath` – dropdown selector for GIF files from `config/gifs/` directory, with a refresh button to rescan.

The `gradient` effect uses the `colorStops` widget to define its color palette.
The `gif` effect uses the `filePath` widget to select GIF files.

Additional widgets support motion controls used by the Orientation panel:
- `speedSlider.mjs` – horizontal slider with a 5% center dead zone for pitch and yaw speeds.

Utilities for RGB conversions live in `utils.mjs`.

Each widget marks its primary input with `data-key` so the host can sync values without re-rendering.
