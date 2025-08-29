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

1. Generate the layout config (see tools/readme.md)
2. Setup your ESP-IDF environment (see esp-idf.md)
3. Run the command below

```
cd firmware
idf.py set-target esp32
idf.py build
```
