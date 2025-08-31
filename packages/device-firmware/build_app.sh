#!/usr/bin/env bash
set -euo pipefail

# Generate configuration
python tools/gen_config.py --layout left.json

# Build firmware
pushd firmware >/dev/null
idf.py fullclean
idf.py set-target esp-32
idf.py build
popd >/dev/null
