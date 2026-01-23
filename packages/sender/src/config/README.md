# Config

Utilities for loading sender configuration and side layout files.

- `load-config.mjs` parses `sender.config.json` and validates renderer, layout paths, and telemetry settings.
- `load-layout.mjs` reads a layout JSON file, validating structure, `port_base`, and `static_ip` used for UDP targets.
