# Barn Lights Firmware

Utilities and firmware for the barn lights project.

## Development

Install Python dependencies:

```
python -m pip install -r tools/requirements.txt
```

Run tests:

```
pytest
cmake -S firmware/test -B firmware/test/build
cmake --build firmware/test/build
./firmware/test/build/test_rx_task
```

For ESP-IDF unit tests and more details on the testing strategy, see
[`tests/readme.md`](tests/readme.md).

Build firmware (requires ESP-IDF):

Ensure the [ESP-IDF](https://docs.espressif.com/projects/esp-idf/) environment is installed
and exported so that the `idf.py` helper is on your `PATH` (e.g. `. $IDF_PATH/export.sh`).
Then run:

```
cd firmware
idf.py set-target esp32
idf.py build
```
