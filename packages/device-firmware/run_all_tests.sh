#!/usr/bin/env bash
set -euo pipefail

# Run Python tests
pytest

# Build and run host tests
cmake -S firmware/test -B firmware/test/build
cmake --build firmware/test/build
./firmware/test/build/test_rx_task
./firmware/test/build/test_status_task

# Execute firmware unit tests
pushd firmware >/dev/null
idf.py test
popd >/dev/null
