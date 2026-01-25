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

## Working Trees

When asked to work in a new git working tree:
1. Create the working tree inside the `working-trees/` directory at the repository root
2. Each working tree directory should be locked to a single Claude session at a time
3. Before using a working tree, check if it's already in use by another session
4. Use a lock file (e.g., `.claude-session.lock`) in the working tree to indicate active use
5. Release the lock when the session ends or when switching away from that working tree
