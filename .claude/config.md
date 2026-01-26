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

## Agent Directives

### General (All Packages)
- Read 'readme.md' files for the module you are working with
- Keep code readable by verbose variable names - never abbreviate to a single letter
- Keep dependencies minimal
- Prefer simple low-code solutions to complex ones where possible
- Pro-actively modularize the code
  - Split groups of functions into separate files with clean interfaces
  - Prefer file lengths of less than 200 lines (light preference)
  - Add readme.md files at the root of each module to describe the architecture and subcomponents
  - Ensure readme files are updated at the end of each task

Your work is deeply appreciated.

### Paths Not to Modify
Do not modify files managed by package managers:
- `**/node_modules/` - Node.js dependencies (renderer, sender)
- `**/managed_components/` - ESP-IDF dependencies (device-firmware)
- `**/package-lock.json` - Dependency lock files

### Package: renderer
**Additional notes:**
- Test suite dependency: Puppeteer requires system libraries. If tests fail, install:
  ```
  sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libcups2t64 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64
  ```

### Running Services During Development

When starting servers or services that bind to ports (e.g., the renderer engine):
- **Always use dynamic port allocation** by specifying port 0, which lets the OS assign an available port
- This prevents port collisions when multiple agents or tests run in parallel
- For the renderer engine: use `--port 0` flag and read the assigned port from stdout (`SERVER_PORT=XXXXX`)

Example:
```bash
# Instead of hardcoding port 8080:
node packages/renderer/bin/engine.mjs --port 0

# The engine outputs the assigned port to stdout:
# SERVER_PORT=54321
```