# Test Suite Flakiness Improvements

This document records findings from a comprehensive review of the test suites in this monorepo. It serves as a guide for future work to improve test robustness, reduce flakiness, and enable parallel execution.

## Overview

The monorepo uses:
- **Node.js built-in test runner** (`node:test`) for JavaScript/TypeScript tests
- **Unity test framework** for C++ firmware tests
- **Puppeteer** for browser-based E2E tests

Test counts: ~13 renderer tests, ~9 sender tests, ~3 firmware tests.

---

## Flakiness Concerns Identified

### 1. Missing Timeout Protection (Priority: HIGH - Easy Fix)

**Problem:** 12 async operations across 8 test files can hang indefinitely.

**Affected Files:**

| File | Line(s) | Issue |
|------|---------|-------|
| `packages/renderer/test/engine.test.mjs` | 12-22 | `for await (line of rl)` - no timeout on readline loop |
| `packages/renderer/test/web.test.mjs` | 10-18, 41-43 | `fetch()` without AbortController; `once(proc, 'exit')` unprotected |
| `packages/renderer/test/gradientPresetWeb.test.mjs` | 10-18, 48-52 | Same as web.test.mjs |
| `packages/sender/test/renderer-process.test.mjs` | 33, 57, 75-76, 95 | `child.on('close', resolve)` without timeout |
| `packages/sender/test/cli.test.mjs` | 27-31 | `child.on('exit', resolve)` after SIGINT |
| `packages/sender/test/cli-config.test.mjs` | 26-31 | Same pattern |
| `packages/sender/test/cli-layout.test.mjs` | 14-19 | Same pattern |
| `packages/sender/test/udp-sender.test.mjs` | 9, 20-22 | UDP bind and message event unprotected |

**Fix Pattern:**
```javascript
// Before (hangs forever if event never fires)
await once(proc, 'exit');

// After (fails after 5 seconds)
const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Process exit timeout')), 5000)
);
await Promise.race([once(proc, 'exit'), timeout]);
```

**For fetch() calls:**
```javascript
// Before
const res = await fetch(url);

// After
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);
try {
  const res = await fetch(url, { signal: controller.signal });
} finally {
  clearTimeout(timeoutId);
}
```

---

### 2. Sequential Execution Requirement (Priority: MEDIUM)

**Problem:** Tests require `--test-concurrency=1` due to shared resources.

**Configuration locations:**
- `packages/renderer/package.json` line 8
- `packages/sender/package.json` line 10

**Shared Resources Causing Conflicts:**

| Resource | Files Affected | Solution |
|----------|---------------|----------|
| Port 8080 (hardcoded) | `web.test.mjs`, `gradientPresetWeb.test.mjs` | Add `--port` CLI flag to `bin/engine.mjs`; use port 0 in tests |
| Preset files (`config/presets/test.json`) | `preset.test.mjs` | Use unique names: `test-${Date.now()}.json` |
| Global `params` object | `engine.test.mjs` | Use `structuredClone(params)` per test |

**Implementation Notes:**

1. **Dynamic port allocation for server:**
   - Modify `packages/renderer/bin/engine.mjs` to accept `--port` argument
   - Modify `packages/renderer/src/server.mjs` `startServer()` to use provided port
   - Update tests to bind to port 0 and read assigned port

2. **Isolated preset files:**
   - Change `preset.test.mjs` to generate unique filenames
   - Clean up in `finally` blocks

3. **Cloned global state:**
   - In `engine.test.mjs`, clone `params` before each test
   - Restore or use fresh clone after test

---

### 3. Puppeteer Browser Test Instability (Priority: MEDIUM)

**Problem:** Browser tests are slow (30+ seconds) and `gradientPresetWeb.test.mjs` currently fails.

**Files:**
- `packages/renderer/test/web.test.mjs`
- `packages/renderer/test/gradientPresetWeb.test.mjs`

**Root Causes:**

1. **No browser pooling:** Each test launches a new Chromium instance (3-5s overhead)
2. **Intentional 600ms delay:** `packages/renderer/src/ui/main.mjs:56` has `setTimeout(..., 600)` for "automated tests waiting for network idle"
3. **Canvas pixel polling:** `waitForFunction` polls every 100ms with 30s default timeout
4. **Current failure:** Preset load doesn't update canvas - likely WebSocket delivery issue

**Improvements:**

```javascript
// Add browser pooling
let browser;
test.before(async () => {
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
});
test.after(async () => {
  await browser.close();
});

// Add explicit timeouts to waitForFunction
await page.waitForFunction(() => {...}, { timeout: 5000 });

// Add debugging on failure
try {
  await page.waitForFunction(...);
} catch (err) {
  const screenshot = await page.screenshot({ path: 'failure.png' });
  const pixels = await page.evaluate(() => {
    return document.getElementById('left').getContext('2d').getImageData(0,0,1,1).data;
  });
  console.error('Canvas state:', pixels);
  throw err;
}
```

---

### 4. Timing-Dependent Tests (Priority: LOW - Architectural)

**Problem:** Tests use fixed `setTimeout` delays (50-500ms) instead of event-based synchronization.

**Locations:**

| File | Line | Delay | Purpose |
|------|------|-------|---------|
| `packages/sender/test/cli.test.mjs` | 27 | 500ms | CLI process initialization |
| `packages/sender/test/cli-config.test.mjs` | 27 | 500ms | CLI process initialization |
| `packages/sender/test/cli-layout.test.mjs` | 15 | 500ms | CLI process initialization |
| `packages/sender/test/integration.test.mjs` | 49, 75 | 300ms | Frame pipeline warm-up |
| `packages/sender/test/integration.test.mjs` | 51, 78 | 50ms | Process teardown |
| `packages/renderer/test/web.test.mjs` | 16 | 100ms | Server readiness retry interval |
| `packages/renderer/test/gradientPresetWeb.test.mjs` | 16 | 100ms | Server readiness retry interval |

**Why These Exist (Not Test Design Flaws):**

1. **Polling-based architecture:** The system uses `setInterval` for frame transmission (1ms UDP polling, 10ms frame emission). No "pipeline complete" events exist.

2. **External subprocesses:** CLI and renderer are spawned as child processes with no direct event access from tests.

3. **No readiness signals:** Servers respond to HTTP before rendering is ready. No `/health` endpoint exists.

**Solution Approach:**

> **Note for Claude Code development:** The solution for timing delays is NOT to modify production code but to improve Claude's tooling to work with these delays gracefully. This could be:
> - A new **skill** that understands timing-sensitive test patterns and can intelligently wait/retry
> - A new **task agent** specialized for running and debugging timing-sensitive tests
> - Enhanced **test runner integration** that can detect and handle polling-based test patterns
>
> Adding health endpoints or instrumentation to production code for test purposes is over-engineering. The delays are reasonable (50-500ms) and the tests pass reliably with sequential execution.

---

## Implementation Checklist

### Phase 1: Timeout Protection (Easy Wins)
- [ ] Add timeout wrapper to `getFrame()` in `engine.test.mjs`
- [ ] Add AbortController to `fetch()` in `waitForServer()` (both web test files)
- [ ] Add timeout to `once(proc, 'exit')` in all test cleanup blocks
- [ ] Add timeout to `child.on('close/exit')` in renderer-process and CLI tests
- [ ] Add timeout to UDP bind and message events

### Phase 2: Test Isolation (Enable Parallelism)
- [ ] Add `--port` argument support to `bin/engine.mjs`
- [ ] Update `server.mjs` to use configurable port
- [ ] Modify browser tests to use dynamic ports
- [ ] Update `preset.test.mjs` to use unique filenames
- [ ] Clone `params` object in `engine.test.mjs` tests
- [ ] Test with `--test-concurrency=4`

### Phase 3: Puppeteer Improvements
- [ ] Implement browser pooling across tests
- [ ] Add explicit timeouts to all `waitForFunction` calls
- [ ] Add screenshot/debug output on test failure
- [ ] Investigate `gradientPresetWeb.test.mjs` WebSocket issue
- [ ] Consider removing 600ms UI delay or making it configurable

### Phase 4: Claude Tooling (For Timing Delays)
- [x] Design skill/task for timing-sensitive test execution
- [x] Implement intelligent retry/wait logic
- [x] Document usage patterns

**Implemented Skills:**
- `.claude/skills/test-runner/SKILL.md` - Diagnose and run tests with pre-flight checks
- `.claude/skills/timing-patterns/SKILL.md` - Reference for timing-sensitive code patterns

**Key capabilities:**
- Pre-flight checks for UI build, config paths, dependencies
- Diagnostic steps for timeout failures, server issues, Puppeteer problems
- Reference documentation for all timing-sensitive code locations
- Best practices for writing new timing-safe tests

---

## File Reference

Key test files:
- `packages/renderer/test/*.test.mjs` - Renderer unit and browser tests
- `packages/sender/test/*.test.mjs` - Sender unit and integration tests
- `packages/device-firmware/test/` - C++ Unity tests

Key production files affecting tests:
- `packages/renderer/bin/engine.mjs` - Server entry point
- `packages/renderer/src/server.mjs` - HTTP server (port 8080 hardcoded)
- `packages/renderer/src/engine.mjs` - Global `params` singleton
- `packages/renderer/src/ui/main.mjs:56` - 600ms initialization delay
- `packages/sender/src/lights-sender.mjs` - CLI entry point

---

## Related PRs

This document was created as part of a long-lived parent PR for test improvements. Individual fixes should be branched from and merged into this parent branch.

Parent PR: *(link will be added when PR is created)*
