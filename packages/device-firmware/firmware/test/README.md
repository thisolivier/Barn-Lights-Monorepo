# Tests

Host-side unit tests for firmware modules. Unity is fetched during the CMake configure step using `FetchContent` from the official repository (tag `v2.5.2`).

## Building and Running

From the repository root:

```
cmake -S firmware/test -B firmware/test/build
cmake --build firmware/test/build
./firmware/test/build/test_rx_task
./firmware/test/build/test_status_task
```

