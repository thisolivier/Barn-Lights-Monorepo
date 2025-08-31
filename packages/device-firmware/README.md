# Barn Lights Firmware

Utilities and firmware for the barn lights project.

## Development

### Install Python dependencies:

You should optionally setup a virtual environment first with:
```
python -m venv venv
source venv/bin/activate
```
Then install your dependencies:
```
python -m pip install -r tools/requirements.txt
```

### Run tests:

```
pytest
cmake -S firmware/test -B firmware/test/build
cmake --build firmware/test/build
./firmware/test/build/test_rx_task
```

For ESP-IDF unit tests and more details on the testing strategy, see
[`tests/readme.md`](tests/readme.md).

### Build firmware (requires ESP-IDF):

1. Generate the layout config (see tools/readme.md)
2. Setup your ESP-IDF environment (see esp-idf.md). 
3. Activate ESP-IDF and test it's in your session path:
```
. ~/esp/esp-idf/export.sh
idf.py --version
```
3. Run the command below

```
cd firmware
idf.py fullclean
idf.py set-target esp32
idf.py build
```

### Flash the ESP32 device

See 'flash-guide.md'

### Convenience scripts

To build the application and generate configuration, run:

```
./build_app.sh
```

To execute all test suites sequentially, run:

```
./run_all_tests.sh
```
