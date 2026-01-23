# Tests

Host-side unit tests for firmware modules. Unity is fetched during the CMake configure step using `FetchContent` from the official repository (tag `v2.5.2`). Tests read run counts and LED lengths from `config_autogen.h` so layouts with any number of runs can be exercised.

The driver task tests include verification that frames exceeding the 64-symbol RMT hardware buffer are transmitted without truncation.

## Building and Running

From the repository root:

```
cmake -S firmware/test -B firmware/test/build
cmake --build firmware/test/build
./firmware/test/build/test_rx_task
./firmware/test/build/test_status_task
./firmware/test/build/test_driver_task
```

