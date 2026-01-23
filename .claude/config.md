# Claude Configuration for LED Lights Monorepo

## Environment Setup

### Node.js Path Loading
Before running any Node.js or npm commands, execute `node --version` once to load Node.js into the zsh PATH. This is required because Node.js is installed via nvm or similar version managers on this system.

Example:
```bash
# First, load node into path
node --version

# Then run npm commands
npm install
npm start
```

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
