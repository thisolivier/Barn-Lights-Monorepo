---
name: test-runner
description: Run and debug tests in the LED lights monorepo with intelligent failure diagnosis
argument-hint: [package-name]
---

# Test Runner Skill

This skill helps run tests and diagnose failures in the LED lights monorepo. It handles common issues like missing build artifacts, incorrect paths, and timing-sensitive test patterns.

## Usage

Invoke with an optional package name:
- `/test-runner` - Run all tests
- `/test-runner renderer` - Run renderer package tests
- `/test-runner sender` - Run sender package tests

## Pre-flight Checks

Before running tests, verify these prerequisites:

### 1. Check React UI Build (renderer package)

The renderer's web tests require the UI to be built:

```bash
ls packages/renderer/src/ui/dist/index.html 2>/dev/null || echo "UI NOT BUILT"
```

If missing, build it:
```bash
npm run build:ui --workspace=packages/renderer
```

### 2. Verify Config Paths

Test fixtures reference config files. Verify they exist:
```bash
ls config/left.json config/right.json
```

### 3. Check Node Modules

Ensure dependencies are installed:
```bash
test -d node_modules || npm install
```

## Running Tests

### All Packages
```bash
npm test --workspaces
```

### Specific Package
```bash
npm test --workspace=packages/$ARGUMENTS
```

### Single Test File
```bash
node --test packages/<package>/test/<file>.test.mjs
```

## Diagnosing Failures

### Timeout Failures

If tests fail with "Process exit timeout" or similar:

1. **Check if child process is crashing**:
   - Look for exit code 2 (renderer error in sender tests)
   - The renderer fixture might not be found

2. **Check fixture config paths**:
   ```bash
   cat packages/sender/test/fixtures/cli_renderer.config.json
   ```
   - `cwd` is resolved relative to config file location
   - `args` paths are relative to `cwd`

3. **Test manually**:
   ```bash
   cd packages/sender
   node bin/lights-sender.mjs --config test/fixtures/cli_renderer.config.json
   ```

### Server Not Responding

If web tests fail with "server not responding":

1. **Check if UI is built** (see pre-flight checks)

2. **Check server manually**:
   ```bash
   cd packages/renderer
   node bin/engine.mjs --config-dir ../../config --port 0
   ```
   Look for `SERVER_PORT=XXXXX` in output

3. **Test HTTP response**:
   ```bash
   curl -v http://localhost:<port>/
   ```

### Puppeteer Failures

If browser tests fail:

1. **Check Puppeteer is installed**:
   ```bash
   ls node_modules/puppeteer
   ```

2. **Try headful mode** for debugging:
   ```javascript
   browser = await puppeteer.launch({ headless: false });
   ```

## Common Issues and Fixes

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "Empty reply from server" | UI not built | `npm run build:ui --workspace=packages/renderer` |
| "Process exit timeout" | Renderer config path wrong | Check `cwd` and `args` in fixture config |
| "Cannot find module" | Dependencies missing | `npm install` |
| Exit code 2 | Renderer crashed | Check renderer fixture exists at resolved path |

## Test Concurrency

Tests can be run with different concurrency levels:
- `--test-concurrency=1` - Sequential (slower, more reliable)
- `--test-concurrency=4` - Parallel (faster, may reveal race conditions)

Phase 1-3 improvements added timeout protection, so hanging tests will now fail fast rather than blocking indefinitely.
