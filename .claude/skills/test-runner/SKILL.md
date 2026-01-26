---
name: test-runner
description: Run and debug tests in the LED lights monorepo
argument-hint: [package-name]
---

# Test Runner Skill

Run tests and diagnose failures in the LED lights monorepo.

## Usage

Invoke with an optional package name:
- `/test-runner` - Run all tests
- `/test-runner renderer` - Run renderer package tests
- `/test-runner sender` - Run sender package tests

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

When tests fail with "Process exit timeout":

1. **Check the diagnostic output** - Tests now log subprocess stderr automatically when processes fail unexpectedly. Look for `[TEST DIAGNOSTIC]` in the output.

2. **Common causes:**
   - Renderer fixture not found (check config paths)
   - Process hung waiting for input
   - Signal handler not working

3. **Debug manually:**
   ```bash
   cd packages/sender
   node bin/lights-sender.mjs --config test/fixtures/cli_renderer.config.json
   ```
   Then send SIGINT (Ctrl+C) to verify clean shutdown.

### Server Not Responding (Renderer Tests)

If web tests fail with "server not responding":

1. **Check server startup manually:**
   ```bash
   cd packages/renderer
   node bin/engine.mjs --config-dir ../../config --port 0
   ```
   Look for `SERVER_PORT=XXXXX` in output.

2. **Test HTTP response:**
   ```bash
   curl -v http://localhost:<port>/
   ```

3. **Common causes:**
   - Server crashes after port assignment (check stderr)
   - Network binding issue

### Puppeteer Failures

For browser test debugging:

1. **Run headful** for visual debugging:
   ```javascript
   browser = await puppeteer.launch({ headless: false });
   ```

2. **Add screenshot on failure:**
   ```javascript
   await page.screenshot({ path: 'debug.png' });
   ```

## Test Concurrency

- `--test-concurrency=1` - Sequential (more reliable, slower)
- `--test-concurrency=4` - Parallel (faster, may reveal race conditions)

Tests have timeout protection, so hanging tests fail fast rather than blocking indefinitely.
