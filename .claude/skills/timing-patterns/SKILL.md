---
name: timing-patterns
description: Reference for timing-sensitive patterns including polling intervals, timeouts, process startup delays, and frame rate timing in the LED lights codebase. Load this when working with tests, debugging timing issues, writing process management code, or when you see setTimeout, setInterval, polling loops, or startup delays.
user-invocable: false
---

# Timing Patterns Reference

This reference documents timing-sensitive patterns throughout the LED lights codebase. Use this context when working with tests, server code, process management, or debugging timing issues.

## Architecture Overview

This is a **polling-based architecture** without event-driven completion signals:

- Frame rendering: Continuous loop at 60 FPS
- UDP transmission: 1ms polling interval
- Telemetry: 1 second reporting interval
- No "pipeline complete" events exist

## Critical Timing Points

### 1. UDP Sender Polling (1ms)

**Location**: `packages/sender/src/udp-sender/index.mjs:28-31`

```javascript
this.timers[sideName] = setInterval(
  () => this.#sendAvailable(sideName, sideConfig, socket),
  1,  // 1ms polling
);
```

**Why**: Ultra-low latency for LED frame transmission.

**Impact on tests**: High CPU usage during tests; tests must properly clean up intervals.

### 2. Server Readiness Polling (100ms)

**Location**: `packages/renderer/test/web.test.mjs:10-29`

```javascript
for (let i = 0; i < retries; i++) {
  // try fetch...
  await new Promise(r => setTimeout(r, 100));
}
```

**Why**: HTTP server binds asynchronously; no readiness callback.

**Impact on tests**: Server must be fully listening before first fetch succeeds.

### 3. Telemetry Reporting (1000ms)

**Location**: `packages/sender/src/telemetry/index.mjs:97-98`

**Why**: Human-readable stats output.

**Impact on tests**: Visible in test output as "side ingested built sent..." lines.

### 4. CLI Process Initialization (500ms)

**Location**: Various test files (cli.test.mjs, cli-config.test.mjs, etc.)

```javascript
await new Promise((resolve) => setTimeout(resolve, 500));
child.kill('SIGINT');
```

**Why**: Allow CLI to fully initialize before sending shutdown signal.

**Impact on tests**: If renderer crashes during this window, test may fail.

### 5. Frame Rate Regulation (16.67ms target at 60 FPS)

**Location**: `packages/renderer/src/engine.mjs:120-141`

Uses `process.hrtime.bigint()` for high-resolution timing.

**Why**: Consistent frame output rate.

**Impact on tests**: Frame timing may vary under CPU load.

### 6. UI Initialization Delay (600ms)

**Location**: `packages/renderer/src/ui/main.mjs:56`

```javascript
setTimeout(..., 600)
```

**Why**: Wait for network idle before automated tests proceed.

**Impact on tests**: Browser tests need this delay for canvas to be ready.

## Test Timeout Strategy

Use explicit timeouts to prevent indefinite hangs:

### Pattern: Promise.race with timeout

```javascript
const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Operation timed out')), 5000)
);
await Promise.race([originalPromise, timeout]);
```

### Helper: withTimeout

`packages/sender/test/helpers/timeout.mjs`:

```javascript
export function withTimeout(promise, ms, message = 'Operation timed out') {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms)
  );
  return Promise.race([promise, timeout]);
}
```

## Dynamic Port Allocation

Services use dynamic port allocation to enable test parallelism:

### Server Side

```javascript
const assignedPort = await startServer(0); // 0 = OS assigns port
console.log(`SERVER_PORT=${assignedPort}`);
```

### Test Side

```javascript
proc.stdout.on('data', chunk => {
  const match = stdout.match(/SERVER_PORT=(\d+)/);
  if (match) port = parseInt(match[1], 10);
});
```

## Best Practices

1. **Always use timeouts**: Wrap async operations with timeout protection
2. **Use dynamic ports**: Never hardcode port numbers
3. **Clean up resources**: Use try/finally for process and socket cleanup
4. **Log diagnostic info**: Output useful state on failure
5. **Avoid fixed delays when possible**: Poll for readiness instead
