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
For ESP-IDF unit tests and more details on the testing strategy, see
[`tests/readme.md`](tests/readme.md). These commands will run the various test suites:

```
pytest
cmake -S firmware/test -B firmware/test/build
cmake --build firmware/test/build
./firmware/test/build/test_rx_task
```
To execute all test suites sequentially, run:

```
./tools/run_all_tests.sh
```

## Deploying Code

### Build firmware (requires ESP-IDF):

1. Generate the layout config (here's the sample for the left side, see tools/readme.md)
```
python tools/gen_config.py --layout left.json
```
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
./tools/build_app.sh
```

## Connecting Lights

* Run 0 → GPIO 12
* Run 1 → GPIO 13
* Run 2 → GPIO 14

## Debugging

### Find out ESP32 port
1. Unplug the adapter.
2. In Terminal:
```
ls -1 /dev/tty.* /dev/cu.* > /tmp/ports_before.txt
```
3. Plug in the adapter, wait 3–5 s, then:
```
ls -1 /dev/tty.* /dev/cu.* > /tmp/ports_after.txt
diff /tmp/ports_before.txt /tmp/ports_after.txt
```

### Check ESP connection
To check if your device is reachable on network:
```
python -m esptool --chip esp32 -p /dev/cu.YOURPORT -b 115200 read_mac
```
With your port, that would look something like 
```
python -m esptool --chip esp32 -p /dev/cu.usbserial-0001 -b 115200 read_mac
```

To open a serial monitor using your serial conversion device (the thing you flashed the ESP32 with):
```
idf.py -p /dev/cu.usbserial-0001 --baud 115200 monitor
```
`ctrl+t x` to exit

(Mac is 34:ab:95:7e:96:38)

### Mintoring telemetry
```
nc -ul 49700
```