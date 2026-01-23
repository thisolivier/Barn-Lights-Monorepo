# Claude Configuration for LED Lights Monorepo

## Project Structure
This is a monorepo with three packages:
- `packages/renderer` - Visual effects engine (Node.js + React)
- `packages/sender` - UDP packet sender (Node.js)
- `packages/device-firmware` - ESP32 firmware (C/ESP-IDF)

## Configuration Files
Master configuration files are in `/config/`:
- `left.json` - Left wall LED layout
- `right.json` - Right wall LED layout
- `left-small.json` - Small test configuration
- `four_run.json` - Four-run test configuration

All packages reference these config files using relative paths.
