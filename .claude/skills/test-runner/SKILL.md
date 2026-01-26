---
name: test-runner
description: Run and debug tests in the LED lights monorepo. Use when running tests, debugging test failures, diagnosing timeout errors, or working with the test suite in packages/renderer or packages/sender.
---

# Test Runner

This skill provides test running commands and debugging guidance for the LED lights monorepo.

## Quick start

Run all tests:
```bash
npm test --workspaces
```

Run tests for a specific package:
```bash
npm test --workspace=packages/renderer
npm test --workspace=packages/sender
```

## Instructions

### Step 1: Identify test scope

Determine which tests to run:

1. **All tests**: Use `npm test --workspaces` for full suite
2. **Single package**: Use `npm test --workspace=packages/<package-name>`
3. **Single file**: Use `node --test packages/<package>/test/<file>.test.mjs`

### Step 2: Run tests with appropriate concurrency

Choose concurrency based on debugging needs:

- **Sequential** (reliable, good for debugging): `--test-concurrency=1`
- **Parallel** (faster, reveals race conditions): `--test-concurrency=4`

### Step 3: Diagnose failures

When tests fail, follow the relevant debugging path below.

## Examples

### Run all package tests
```bash
npm test --workspaces
```

### Run renderer package tests
```bash
npm test --workspace=packages/renderer
```

### Run sender package tests
```bash
npm test --workspace=packages/sender
```

### Run a single test file
```bash
node --test packages/sender/test/cli.test.mjs
```

### Run tests sequentially for debugging
```bash
npm test --workspace=packages/sender -- --test-concurrency=1
```

## Best practices

- **Check diagnostic output first**: Tests log subprocess stderr automatically. Look for `[TEST DIAGNOSTIC]` in output.
- **Run sequentially when debugging**: Use `--test-concurrency=1` to isolate issues.
- **Verify fixtures exist**: Many failures stem from missing config files or fixtures.
- **Tests have timeout protection**: Hanging tests fail fast rather than blocking indefinitely.

## Debugging common failures

### Timeout failures ("Process exit timeout")

**Common causes:**
- Renderer fixture not found (check config paths)
- Process hung waiting for input
- Signal handler not working

**Debug steps:**
1. Check the diagnostic output for `[TEST DIAGNOSTIC]` messages
2. Debug manually:
   ```bash
   cd packages/sender
   node bin/lights-sender.mjs --config test/fixtures/cli_renderer.config.json
   ```
3. Send SIGINT (Ctrl+C) to verify clean shutdown

### Server not responding (Renderer tests)

**Common causes:**
- Server crashes after port assignment
- Network binding issue

**Debug steps:**
1. Start server manually:
   ```bash
   cd packages/renderer
   node bin/engine.mjs --config-dir ../../config --port 0
   ```
2. Look for `SERVER_PORT=XXXXX` in output
3. Test HTTP response:
   ```bash
   curl -v http://localhost:<port>/
   ```

### Puppeteer failures (Browser tests)

**Debug steps:**
1. Run headful for visual debugging:
   ```javascript
   browser = await puppeteer.launch({ headless: false });
   ```
2. Add screenshot on failure:
   ```javascript
   await page.screenshot({ path: 'debug.png' });
   ```

## Requirements

- Node.js with native test runner support
- npm workspaces configured in the monorepo
- Puppeteer for browser tests (renderer package)
