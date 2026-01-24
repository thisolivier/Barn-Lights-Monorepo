# Telemetry Service Implementation Plan

## Overview

Add a new `packages/telemetry` service that aggregates logs from renderer/sender (via UDP) and heartbeats from devices, exposing a dashboard and API.

---

## Phase 1: Shared Logger Module

**Goal**: Create a shared UDP logger that sender and renderer can import.

### Files to Create

**packages/shared/package.json**
```json
{
  "name": "@led-lights/shared",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    "./udp-logger": "./src/udp-logger.mjs"
  }
}
```

**packages/shared/src/udp-logger.mjs**
- `createLogger(options)` factory function
- Options: `{ component: string, target: { host: string, port: number }, level?: string }`
- Methods: `error()`, `warn()`, `info()`, `debug()`
- Each method: `(msg: string, meta?: object) => void`
- Sends JSON via UDP: `{ ts, level, component, msg, ...meta }`
- Graceful fallback: if UDP fails, log to console
- Level filtering (only send if level >= configured threshold)

### Files to Modify

**package.json** (root)
- Add `"packages/shared"` to workspaces array

---

## Phase 2: Telemetry Service Core

**Goal**: Create the telemetry package with UDP receivers and log buffer.

### Files to Create

**packages/telemetry/package.json**
```json
{
  "name": "@led-lights/telemetry",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "telemetry": "bin/telemetry.mjs"
  },
  "dependencies": {}
}
```

**packages/telemetry/bin/telemetry.mjs**
- Entry point, parse CLI args (--port for HTTP, --log-port, --heartbeat-port)
- Initialize UDP receivers, log buffer, HTTP server
- Graceful shutdown on SIGINT/SIGTERM

**packages/telemetry/src/udp-receiver.mjs**
- `createUdpReceiver(port, onMessage)` - binds UDP socket, parses JSON, calls handler
- Handle parse errors gracefully

**packages/telemetry/src/log-buffer.mjs**
- Ring buffer class with configurable max size (default 1000 entries)
- Methods: `add(entry)`, `query({ level?, component?, limit?, offset? })`, `clear()`
- Entries stored with receive timestamp

**packages/telemetry/src/aggregator.mjs**
- Tracks device state: `{ left: {...}, right: {...} }`
- Updates on heartbeat, computes derived metrics (packet loss %, uptime)
- Methods: `updateDevice(heartbeat)`, `getDeviceStatus()`, `getSystemHealth()`

---

## Phase 3: HTTP/WebSocket Server & Dashboard

**Goal**: Expose API endpoints and real-time WebSocket, plus simple dashboard.

### Files to Create

**packages/telemetry/src/server.mjs**
- HTTP server on configurable port (default 3001)
- Routes:
  - `GET /` - serve dashboard HTML
  - `GET /api/status` - system health + device status
  - `GET /api/logs` - query log buffer (query params: level, component, limit)
  - `GET /api/devices` - device status array
- WebSocket server on same port
  - On connect: send current state
  - Broadcast on new log entry or heartbeat

**packages/telemetry/src/ui/index.html**
- Simple dashboard with:
  - Device status cards (left/right)
  - Live log stream (filterable)
  - Connection status indicator

**packages/telemetry/src/ui/dashboard.mjs**
- WebSocket client, DOM updates
- Log filtering by level/component

---

## Phase 4: Integrate Logger into Sender

**Goal**: Replace sender's console logging with shared UDP logger.

### Files to Modify

**packages/sender/package.json**
- Add dependency: `"@led-lights/shared": "*"`

**packages/sender/src/cli.mjs**
- Replace `createLogger()` function with import from `@led-lights/shared/udp-logger`
- Configure with `component: 'sender'`, target port 49800
- Pass logger to all components as before

**packages/sender/src/renderer-process/index.mjs**
- Use injected logger (already does this)

**packages/sender/src/udp-sender/index.mjs**
- Use injected logger for errors (already does this)

**packages/sender/src/telemetry/index.mjs**
- Use injected logger for stats output
- Optionally: emit stats as structured log entries

---

## Phase 5: Integrate Logger into Renderer

**Goal**: Replace renderer's console logging with shared UDP logger.

### Files to Modify

**packages/renderer/package.json**
- Add dependency: `"@led-lights/shared": "*"`

**packages/renderer/src/server.mjs**
- Import shared logger, configure with `component: 'renderer.server'`
- Replace `console.error` calls

**packages/renderer/src/engine.mjs**
- Accept logger option, use for any logging needs

**packages/renderer/src/ui/connection.mjs** (client-side)
- Keep console logging (runs in browser, can't use UDP)

---

## Phase 6: PM2 & Testing

**Goal**: Update PM2 config, add tests, verify end-to-end.

### Files to Modify

**ecosystem.config.cjs**
- Add telemetry app configuration

**package.json** (root)
- Add `"test:telemetry"` script
- Update workspaces to include telemetry

### Files to Create

**packages/telemetry/test/log-buffer.test.mjs**
- Test ring buffer behavior, query filtering

**packages/telemetry/test/aggregator.test.mjs**
- Test device state tracking

**packages/shared/test/udp-logger.test.mjs**
- Test log formatting, level filtering

### End-to-End Verification

1. Start telemetry service
2. Start sender (which spawns renderer)
3. Verify logs appear in telemetry dashboard
4. Verify device heartbeats aggregated (if devices available, or mock)
5. All tests pass

---

## Port Assignments

| Port | Purpose |
|------|---------|
| 49700 | Device heartbeats (existing) |
| 49800 | Application logs (new) |
| 3001 | Telemetry HTTP/WS server (new) |
| 8080 | Renderer UI (existing) |

---

## Success Criteria

- [ ] Shared logger sends structured JSON over UDP
- [ ] Telemetry service receives and buffers logs
- [ ] Telemetry service receives device heartbeats
- [ ] Dashboard displays live logs and device status
- [ ] All existing tests still pass
- [ ] New tests for telemetry components pass
