# Tools

The `gen_config.py` script reads a layout JSON file and writes `firmware/include/config_autogen.h` with constants used by the firmware.

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
