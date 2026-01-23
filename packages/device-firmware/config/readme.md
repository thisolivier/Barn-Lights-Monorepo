# Configuration Layouts

This directory stores layout JSON files used to generate firmware configuration headers.

- `left.json` – sample layout for the left side controller
- `right.json` – sample layout for the right side controller
- `four_run.json` – example layout featuring four LED runs

These files are consumed by `tools/gen_config.py` to produce `firmware/include/config_autogen.h`.
