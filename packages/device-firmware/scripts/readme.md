# Build Scripts

This directory contains Python scripts for build-time code generation and configuration.

## Overview

The firmware uses build-time code generation to create hardware-specific configuration from JSON layout files. This eliminates the need for runtime configuration and reduces firmware complexity.

## Scripts

### gen_config.py
Generates `src/config_autogen.h` from device JSON configuration files.

**Purpose**: Converts JSON layout configuration into C++ header constants for compile-time inclusion in firmware.

**Usage**:
```bash
python scripts/gen_config.py config/left.json > src/config_autogen.h
python scripts/gen_config.py config/right.json > src/config_autogen.h
```

**Input**: JSON configuration file (e.g., `config/left.json`)

**Output**: C++ header with constants:
- `SIDE_ID`: Device identifier ("LEFT" or "RIGHT")
- `RUN_COUNT`: Number of LED runs (max 8)
- `LED_COUNT[]`: Array of LED counts per run
- `MAX_LEDS_PER_STRIP`: Longest run length
- `EXPECTED_MASK`: Bitmask of active runs
- Network configuration: IP addresses, ports, gateway, netmask

**Validation**:
- Enforces `RUN_COUNT <= 8` (OctoWS2811 hardware limit)
- Enforces `LED_COUNT <= 800` per run (memory/performance limit)
- Validates IP address format (4 bytes, 0-255)

**Example Generated Constants**:
```cpp
#define SIDE_ID "LEFT"
#define RUN_COUNT 4
static const int LED_COUNT[] = {400, 400, 400, 400};
#define MAX_LEDS_PER_STRIP 400
#define EXPECTED_MASK 0b1111

static const uint8_t STATIC_IP[] = {10, 10, 0, 2};
#define PORT_BASE 49600
#define STATUS_PORT 49700
// ... etc
```

### prebuild.py
PlatformIO pre-build script that automatically runs `gen_config.py` before compilation.

**Purpose**: Integrates config generation into the PlatformIO build process, ensuring `config_autogen.h` is always up-to-date.

**Usage**: Automatically invoked by PlatformIO when building:
```bash
LED_CONFIG=config/left.json pio run
LED_CONFIG=/absolute/path/to/device.json pio run
```

**Environment Variable**: `LED_CONFIG`
- Must be set to point to the desired configuration JSON file
- Can be relative to project root or absolute path
- Build fails with helpful error if not set

**Process**:
1. Reads `LED_CONFIG` environment variable
2. Validates config file exists
3. Invokes `gen_config.py` with config path
4. Writes output to `src/config_autogen.h`
5. Reports success or failure

**PlatformIO Integration**:
Configured in `platformio.ini`:
```ini
[env:teensy41]
extra_scripts = pre:scripts/prebuild.py
```

## Configuration Format

See `config/readme.md` for JSON schema and examples.

Required fields in device JSON:
- `side`: "left" or "right"
- `runs`: Array of run configurations
  - `run_index`: 0-7 (OctoWS2811 output number)
  - `led_count`: Number of LEDs in this run
- Network settings:
  - `static_ip`: Device IP address [10, 10, 0, 2]
  - `static_netmask`: Subnet mask [255, 255, 255, 0]
  - `static_gateway`: Gateway IP [10, 10, 0, 1]
  - `sender_ip`: Sender IP for heartbeats [10, 10, 0, 1]
  - `port_base`: Base UDP port (e.g., 49600)
  - `status_port`: Heartbeat destination port (e.g., 49700)

## Build Integration

### Development Build
```bash
# Left side
LED_CONFIG=config/left.json pio run

# Right side
LED_CONFIG=config/right.json pio run

# Custom config
LED_CONFIG=/path/to/custom.json pio run
```

### Flash to Device
```bash
LED_CONFIG=config/left.json pio run --target upload
```

### Testing
```bash
LED_CONFIG=config/right.json pio test
```

## Adding New Configuration Options

To add a new config parameter:

1. Add field to JSON schema in `config/readme.md`
2. Update validation in `gen_config.py::validate_config()`
3. Extract value in `gen_config.py::generate_header()`
4. Output as C++ constant in generated header
5. Document in `config/readme.md`
6. Update example config files in `config/`

## Error Handling

### Missing LED_CONFIG
If `LED_CONFIG` not set, `prebuild.py` fails with:
```
ERROR: LED_CONFIG environment variable not set

Usage:
  LED_CONFIG=config/left.json pio run
```

### Invalid Configuration
If validation fails, `gen_config.py` exits with descriptive error:
- `RUN_COUNT exceeds maximum of 8`
- `LED_COUNT exceeds maximum of 800`
- `Invalid static_ip: [...]`

### File Not Found
If config file doesn't exist:
```
ERROR: Config file not found: /path/to/config.json
```

## Dependencies

- **Python 3.11+**: Required for script execution
- **PlatformIO**: Build system integration
- **json**: Standard library for JSON parsing
- **pathlib**: Standard library for file path handling

## Design Rationale

Build-time configuration provides:
- Zero runtime overhead (no file I/O, no parsing)
- Compile-time optimization (constants enable aggressive inlining)
- Type safety (C++ compiler checks)
- No filesystem required (Teensy 4.1 has no SD card in this design)
- Simplified firmware (no config management code)
- Per-device binaries (left and right builds are distinct)

The trade-off is that firmware must be recompiled for different configurations, but this is acceptable given:
- Two devices with fixed layouts (left/right)
- Configurations rarely change in production
- Build process is fast (<30 seconds)
