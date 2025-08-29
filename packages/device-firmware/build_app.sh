#!/usr/bin/env bash
set -euo pipefail

# Generate configuration
python tools/gen_config.py --layout left.json

# Build firmware
pushd firmware >/dev/null
idf.py fullclean
idf.py build
popd >/dev/null
