# Barn Lights Firmware

Utilities and firmware for the barn lights project.

## Setup dev environment instructions

Requires PlatformIO CLI. Install via:
```bash
pip install platformio
```

## Build firmware instructions

The firmware requires an LED config JSON file specified via the `LED_CONFIG` environment variable. The config is parsed at build time and baked into the binary as `src/config_autogen.h`.

**From the monorepo root** (recommended):
```bash
# Build for left controller
make build-firmware-left

# Build for right controller
make build-firmware-right

# Build both
make build-firmware-all

# Or using npm
npm run build:firmware:left
npm run build:firmware:right
```

**From this directory**:
```bash
# Using local config
LED_CONFIG=config/right.json pio run -e teensy41

# Using root config
LED_CONFIG=../../config/right.json pio run -e teensy41
```

## Run tests instructions

```bash
# From monorepo root
npm run test:firmware

# From this directory
LED_CONFIG=config/right.json pio test -e native
```