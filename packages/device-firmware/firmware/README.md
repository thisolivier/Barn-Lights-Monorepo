# Firmware

This directory contains the ESP-IDF based firmware for the Barn Lights system.

## Architecture

- **main/**: entry point containing `app_main.c`. It creates FreeRTOS tasks:
  - `network_task` handles networking.
  - `rx_task` processes inbound messages.
  - `driver_task` drives the light output with one RMT channel per run, triggering channels simultaneously and, on startup, flashing each run for one second with RGB 218,170,52 after an initial one second delay.
  - `status_task` emits a heartbeat JSON every second to `SENDER_IP:STATUS_PORT` containing runtime counters.
- **components/**: custom components for the firmware (currently empty).

## Building

First ensure you have generated your config using `./tools/gen_config.py` (see tools/readme.md).
Ensure ESP-IDF is installed and in your PATH (see `./ESP-IDF.md`)
Navigate to this directory, then run:

```
idf.py set-target esp32
idf.py build
```