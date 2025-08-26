# Controls

Dynamic UI widgets for effect parameters.

- `index.mjs` – exports `renderControls` which builds form elements from a schema.
- `number.mjs` – slider/number input.
- `checkbox.mjs` – boolean toggle.
- `enum.mjs` – dropdown selector.
- `color.mjs` – RGB color picker.
- `colorStops.mjs` – editable list of color/position pairs.

Utilities for RGB conversions live in `utils.mjs`.

Each widget marks its primary input with `data-key` so the host can sync values without re-rendering.
