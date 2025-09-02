#!/usr/bin/env bash
set -euo pipefail

# Determine repository root relative to this script
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"

# Generate configuration
python "${repository_root}/tools/gen_config.py" --layout "${repository_root}/config/left.json"

# Build firmware
pushd "${repository_root}/firmware" >/dev/null
idf.py fullclean
idf.py set-target esp-32
idf.py build
popd >/dev/null
