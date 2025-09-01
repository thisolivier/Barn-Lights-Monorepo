# Tools

The `gen_config.py` script reads a layout JSON file and writes `firmware/include/config_autogen.h` with constants used by the firmware. Layout files must include `static_ip`, `static_netmask`, and `static_gateway` fields, each listing four integer octets. These values become the `STATIC_IP_ADDR*`, `STATIC_NETMASK_ADDR*`, and `STATIC_GW_ADDR*` macros in the generated header. `port_base` and `gateway_telemetry_port` fields map to `PORT_BASE` and `STATUS_PORT` macros. Up to four LED runs are supported, with a maximum of 400 LEDs per run; `RUN_COUNT` and the `LED_COUNT` array are derived from the provided runs.

## Installation

Install dependencies:

```
python -m pip install -r tools/requirements.txt
```

## Usage

Generate configuration from a layout file:

```
python tools/gen_config.py --layout left.json
```

Specify a custom output path if needed:

```
python tools/gen_config.py --layout right.json --output /tmp/config.h
```

The script will exit with an error when the layout file is malformed or missing
required fields. It will also report permission errors if the output path is
not writable.
