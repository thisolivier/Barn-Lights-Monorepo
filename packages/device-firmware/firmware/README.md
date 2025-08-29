# Firmware

This directory contains the ESP-IDF based firmware for the Barn Lights system.

## Architecture

- **main/**: entry point containing `app_main.c`. It creates FreeRTOS tasks:
  - `network_task` handles networking.
  - `rx_task` processes inbound messages.
  - `driver_task` drives the light output with one RMT channel per run, triggering channels simultaneously and enforcing a one second blackout at boot.
  - `status_task` emits a heartbeat JSON every second to `SENDER_IP:STATUS_PORT` containing runtime counters.
- **components/**: custom components for the firmware (currently empty).

## Building

Ensure the ESP-IDF environment is installed and exported so that `idf.py`
is available (e.g. `. $IDF_PATH/export.sh`). Then run:

```
idf.py set-target esp32
idf.py build
```

`config_autogen.h` contains constants derived from the layout JSON files and can be regenerated:

```
python tools/gen_config.py --layout left.json
```
