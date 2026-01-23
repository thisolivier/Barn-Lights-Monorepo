#!/usr/bin/env bash
set -euo pipefail

# Determine repository root relative to this script
script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"

pushd "${repository_root}" >/dev/null

# Run Python tests
pytest

# Build and run host tests
cmake -S firmware/test -B firmware/test/build
cmake --build firmware/test/build
./firmware/test/build/test_rx_task
./firmware/test/build/test_status_task
./firmware/test/build/test_driver_task

popd >/dev/null
