# LED Lights Monorepo

A unified monorepo for LED lighting system with visual effects rendering, UDP packet transmission, and Teensy 4.1 device firmware.

## Quick Start

```bash
# First-time setup
npm run setup

# Start all services
npm start

# View logs
npm run logs

# Check status
npm run status

# Stop all services
npm stop
```

The WebUI will be available at [http://localhost:8080](http://localhost:8080)

## Architecture

This monorepo contains three main packages:

### 📦 packages/renderer
Visual effects engine that generates RGB frame data at 60 FPS.
- WebUI for real-time control
- Effect library (gradients, plasma, fire, etc.)
- Scene transformation pipeline
- Built with Node.js + React

### 📦 packages/sender
UDP packet sender that receives frames from renderer and transmits to controllers.
- Frame assembly and validation
- UDP transmission to multiple controllers
- Telemetry and monitoring
- Process management for renderer

### 📦 packages/device-firmware
Teensy 4.1 firmware for LED controllers (C/PlatformIO).
- UDP packet reception
- WS2812B LED driving via OctoWS2811
- Status monitoring and heartbeat
- Optimized for low latency

## Configuration

Master configuration files are in `/config/`:
- `left.json` - Left wall LED layout
- `right.json` - Right wall LED layout
- `left-small.json` - Small test configuration

### Config Management Strategy

All packages require explicit configuration paths via CLI flags (no environment variables):

| Package | Config Method | Required Flag |
|---------|---------------|---------------|
| `renderer` | CLI flag | `--config-dir <path>` |
| `sender` | CLI flag | `--config <path>` |
| `device-firmware` | Build-time env var | `LED_CONFIG=<path>` |

The monorepo's `npm start` command runs the sender via PM2, which spawns and manages the renderer as a child process.

### Building Firmware

Build firmware with specific configs using make targets or npm scripts:

```bash
# Using make
make build-firmware-left
make build-firmware-right
make build-firmware-all

# Using npm
npm run build:firmware:left
npm run build:firmware:right
```

## Development

### Running Tests

```bash
# All tests
npm test

# Individual packages
npm run test:renderer
npm run test:sender
npm run test:firmware
```

### Working with Individual Packages

```bash
# Renderer
cd packages/renderer
npm install
npm test
npm start

# Sender
cd packages/sender
npm install
npm test
npm start

# Firmware (requires PlatformIO)
cd packages/device-firmware
LED_CONFIG=../../config/left.json pio run -e teensy41
pio test -e native
```

### Service Management

```bash
# Start services
npm start

# Restart the sender (which manages the renderer as a child process)
pm2 restart sender

# View logs (renderer logs are interleaved with sender)
pm2 logs sender

# Stop all services
npm stop

# Health check
bash scripts/health-check.sh
```

## Network Configuration

The system communicates with LED controllers over UDP:
- **Left controller**: 10.10.0.2:5555
- **Right controller**: 10.10.0.3:5555

Ensure your network is configured correctly and controllers are accessible.

## System Requirements

- **Node.js**: >= 20.0.0
- **PM2**: Installed automatically
- **PlatformIO**: Optional, for firmware development
- **Platform**: macOS, Linux (native), or Windows (WSL)

## Project Structure

```
led-lights/
├── config/                  # Master configuration files
│   ├── left.json
│   ├── right.json
│   └── left-small.json
├── packages/
│   ├── renderer/           # Visual effects engine
│   ├── sender/             # UDP packet sender
│   └── device-firmware/    # ESP32 firmware
├── scripts/                # Setup and utility scripts
│   ├── setup.sh
│   ├── test-all.sh
│   └── health-check.sh
├── logs/                   # PM2 logs (gitignored)
├── package.json            # Root workspace config
└── ecosystem.config.js     # PM2 configuration
```

## Troubleshooting

### Services won't start
```bash
# Check what's running
npm run status

# View logs for errors
npm run logs

# Restart everything
npm restart
```

### WebUI not accessible
- Check if renderer is running: `pm2 status`
- Verify port 8080 is not in use: `lsof -i :8080`
- Check renderer logs: `pm2 logs renderer`

### UDP packets not reaching controllers
- Ping controllers: `ping 10.10.0.2`
- Run health check: `bash scripts/health-check.sh`
- Verify network configuration matches `/config/*.json`

### Tests failing
- Ensure dependencies are installed: `npm install`
- Check Node.js version: `node -v` (should be >= 20)
- Run individual test suites to isolate issues

## Documentation

- [Renderer Documentation](./packages/renderer/README.md)
- [Sender Documentation](./packages/sender/README.md)
- [Firmware Documentation](./packages/device-firmware/README.md)
- [UDP Data Format](./packages/device-firmware/docs/udp-data-format.md)
- [Project Specification](./packages/device-firmware/docs/project-spec.md)

## Contributing

See [AGENTS.md](./AGENTS.md) for development guidelines and best practices.

## License

MIT
