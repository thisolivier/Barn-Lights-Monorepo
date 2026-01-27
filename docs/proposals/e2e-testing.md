# Planning Document: End-to-End Testing Strategy

**Version:** 1.0
**Date:** 2026-01-27
**Status:** Draft
**Depends on:** None (testing infrastructure enhancement)

---

## 1. Overview

### 1.1 Purpose

Define a comprehensive end-to-end testing strategy for the LED lights monorepo that validates the complete system from user input through to UDP output, while balancing test coverage against project complexity.

### 1.2 Goals

- Catch integration regressions between packages (renderer, sender, firmware)
- Validate configuration consistency across the system
- Ensure critical user workflows function correctly
- Maintain development velocity with fast, reliable tests

### 1.3 Non-Goals (for initial version)

- Hardware-in-the-loop testing (keep as manual pre-release validation)
- 100% E2E coverage (unit tests remain primary coverage mechanism)
- Visual pixel-perfect regression testing (optional future enhancement)

---

## 2. Current Testing Landscape

### 2.1 Existing Test Infrastructure

| Package | Framework | Test Count | Coverage Type |
|---------|-----------|------------|---------------|
| Renderer | node:test + Puppeteer | 12 tests | Unit + basic browser |
| Sender | node:test | 9 tests | Unit + integration |
| Firmware | Unity (C++) | 3 suites | Unit + native simulation |

### 2.2 Existing Integration Tests

- `packages/sender/test/integration.test.mjs` - Tests renderer → assembler → UDP pipeline
- `packages/renderer/test/web.test.mjs` - Basic Puppeteer WebUI validation

### 2.3 Test Execution

```bash
npm test                      # Run all tests (renderer + sender)
npm run test:renderer         # Renderer only
npm run test:sender           # Sender only
make test                     # Makefile alias
```

---

## 3. Proposed E2E Test Types

### 3.1 Full Pipeline E2E Tests (Sender → Renderer → UDP Output)

**Description:** Validate the complete data flow from user configuration through to UDP packet output.

**What it tests:**
- Renderer spawns correctly from sender
- NDJSON frame format is valid and parseable
- LED count matches layout configuration
- UDP packets are correctly assembled and addressed
- Frame timing meets 60 FPS target

**Implementation approach:**
```
[Test Harness] → [Sender Process] → [Renderer Subprocess]
                         ↓
              [Mock UDP Listener]
                         ↓
              [Frame Validation]
```

**Benefits:**
- Catches integration regressions between packages
- Validates configuration consistency across system
- Ensures protocol compatibility

**Complexity Cost:** Medium
- Requires test orchestration for multiple processes
- Need mock UDP listeners
- Timing-sensitive assertions

---

### 3.2 WebUI End-to-End Tests (Browser Automation)

**Description:** Test the renderer's React-based control panel through real browser interactions.

**What it tests:**
- Effect selection and parameter adjustment
- Color picker/gradient interactions
- Preset save/load functionality
- WebSocket connection stability
- Real-time preview updates

**Implementation approach:**
```
[Puppeteer/Playwright] → [Browser] → [Renderer WebUI]
                                           ↓
                                    [WebSocket frames]
                                           ↓
                              [Validate output changes]
```

**Benefits:**
- Catches UI regressions
- Validates user workflows
- Tests WebSocket communication

**Complexity Cost:** Medium-High
- Puppeteer already in use, but tests are minimal
- Flaky test risk with timing/animation
- Requires headless browser infrastructure in CI

---

### 3.3 Visual Regression Testing

**Description:** Capture rendered LED frames and compare against golden baselines.

**What it tests:**
- Effect algorithms produce consistent output
- Parameter changes produce expected visual changes
- Preset configurations render correctly

**Implementation approach:**
```
[Test] → [Render N frames] → [Compare to baseline PNG/JSON]
```

**Benefits:**
- Catches subtle rendering bugs
- Documents expected behavior visually
- Validates effect implementations

**Complexity Cost:** Medium
- Need frame capture mechanism
- Baseline management overhead
- Floating-point tolerance handling

---

### 3.4 Configuration Validation E2E

**Description:** Verify that LED layout configurations are consistent and valid across all packages.

**What it tests:**
- JSON schema compliance
- LED counts match between renderer/sender/firmware
- Network configuration consistency
- Bounds and coordinate validation

**Implementation approach:**
```
[Test] → [Load all config/*.json]
             ↓
      [Validate schema]
      [Cross-check totals]
      [Verify IP/port assignments]
```

**Benefits:**
- Prevents deployment mismatches
- Catches configuration drift early
- Simple to implement

**Complexity Cost:** Low
- Uses existing config loading code
- No process orchestration needed

---

### 3.5 Hardware-in-the-Loop (HIL) Testing

**Description:** Test against real Teensy hardware connected via USB/network.

**What it tests:**
- Firmware receives and processes UDP correctly
- LED output matches expected frame data
- Timing and synchronization
- Error recovery and reconnection

**Implementation approach:**
```
[Test Host] → [UDP to Teensy] → [Serial debug output]
                                         ↓
                              [Validate via serial]
```

**Benefits:**
- Catches hardware-specific issues
- Validates real-world performance
- Tests network stack

**Complexity Cost:** High
- Requires physical hardware
- Not suitable for CI without dedicated infrastructure
- Complex debug/validation

---

### 3.6 Performance/Stress E2E Tests

**Description:** Validate system performance under load.

**What it tests:**
- Sustained 60 FPS output over time
- Memory stability (no leaks)
- CPU usage within bounds
- UDP packet loss handling

**Implementation approach:**
```
[Test] → [Run system for N minutes]
             ↓
      [Monitor FPS, memory, CPU]
      [Validate no degradation]
```

**Benefits:**
- Catches memory leaks
- Validates real-world stability
- Documents performance characteristics

**Complexity Cost:** Medium
- Long-running tests
- Platform-specific behavior
- May need separate CI job

---

## 4. Cost-Benefit Analysis

| Test Type | Implementation Effort | Maintenance Cost | Bug Detection Value | Recommended |
|-----------|----------------------|------------------|---------------------|-------------|
| Full Pipeline E2E | Medium | Medium | High | **Yes** |
| WebUI E2E | Medium-High | High | Medium | Selective |
| Visual Regression | Medium | Medium | Medium | Optional |
| Config Validation | Low | Low | Medium | **Yes** |
| Hardware-in-Loop | High | High | High | No (manual) |
| Performance/Stress | Medium | Low | Medium | Optional |

---

## 5. Complexity Costs to the Project

### 5.1 Direct Costs

| Factor | Impact | Mitigation |
|--------|--------|------------|
| **CI Time** | E2E tests are slower (10-60s each) | Run in parallel, separate CI job |
| **Flakiness** | Browser/timing tests can be flaky | Retry logic, deterministic waits |
| **Maintenance** | Tests break when features change | Keep tests focused, avoid over-specification |
| **Dependencies** | Puppeteer/Playwright add ~200MB | Already using Puppeteer |
| **Test Data** | Golden baselines need management | Git LFS or separate artifact storage |
| **Debugging** | E2E failures harder to diagnose | Good logging, screenshot on failure |

### 5.2 Indirect Costs

- **Developer friction**: Slow tests discourage frequent running
- **False confidence**: E2E tests passing doesn't guarantee correctness
- **Scope creep**: Tendency to add "just one more" assertion
- **Environment differences**: Tests may pass locally but fail in CI

### 5.3 Mitigations

1. **Test pyramid discipline**: Maintain ratio of many unit tests, fewer integration tests, minimal E2E tests
2. **Clear ownership**: Each E2E test has a documented purpose and owner
3. **Flakiness budget**: Track and fix flaky tests aggressively
4. **Fast feedback**: Run unit tests on every commit, E2E tests on PR merge

---

## 6. Implementation Phases

### Phase 1: Low Complexity, High Value

**Estimated scope:** 2-3 test files

1. **Configuration Validation E2E**
   - Add cross-package config consistency tests
   - Validate schema compliance
   - Check LED count totals match

2. **Expand Pipeline Integration**
   - Extend existing `integration.test.mjs`
   - Add more frame format validation
   - Test error handling paths

### Phase 2: Medium Complexity

**Estimated scope:** 3-5 test files

3. **WebUI Critical Path Tests**
   - Preset save/load workflow
   - Effect switching
   - WebSocket connection handling

4. **Visual Regression for Effects** (Optional)
   - Capture baseline frames for each effect type
   - Compare output deterministically

### Phase 3: When Needed

**Estimated scope:** 1-2 test files, separate CI job

5. **Performance Tests**
   - Add stability tests for long-running scenarios
   - Memory leak detection
   - FPS consistency validation

6. **Hardware-in-Loop**
   - Keep as manual validation pre-release
   - Document procedure in runbook

---

## 7. Recommended Test Structure

### 7.1 Directory Layout

```
packages/
├── renderer/
│   └── test/
│       ├── unit/           # Fast, isolated tests
│       ├── integration/    # Multi-module tests
│       └── e2e/            # Browser-based tests
│           ├── presets.e2e.mjs
│           └── effects.e2e.mjs
├── sender/
│   └── test/
│       ├── unit/
│       ├── integration/
│       └── e2e/
│           └── pipeline.e2e.mjs
└── e2e/                    # Cross-package E2E tests
    ├── config-validation.test.mjs
    └── full-pipeline.test.mjs
```

### 7.2 Test Naming Convention

- `*.test.mjs` - Unit and integration tests (run by default)
- `*.e2e.mjs` - End-to-end tests (run separately)

### 7.3 CI Configuration

```yaml
# Run on every push
test-unit:
  script: npm test

# Run on PR merge
test-e2e:
  script: npm run test:e2e
  timeout: 10m
```

---

## 8. Success Criteria

### 8.1 Metrics

| Metric | Target |
|--------|--------|
| E2E test count | 5-10 tests |
| E2E test duration | < 2 minutes total |
| Flakiness rate | < 1% |
| Coverage of critical paths | 100% |

### 8.2 Critical Paths to Cover

1. **Configuration loading** - Config files parsed correctly
2. **Renderer startup** - Engine starts and produces frames
3. **Frame transmission** - Frames flow to UDP output
4. **Preset management** - Save/load presets work
5. **Effect selection** - Changing effects updates output

---

## 9. Open Questions

1. **Playwright vs Puppeteer**: Should we migrate to Playwright for better browser support and auto-waiting?

2. **CI Hardware**: Should E2E tests run on dedicated CI runners for consistency?

3. **Visual baselines**: Where should golden image baselines be stored (repo, LFS, artifact storage)?

4. **Test data**: Should we create dedicated test configurations or use production configs?

---

## 10. Summary

The most impactful E2E testing additions would be:

1. **Configuration validation tests** (low effort, prevents deployment issues)
2. **Extended pipeline integration tests** (builds on existing infrastructure)
3. **Selective WebUI tests** for critical user flows

Visual regression and performance testing are valuable but optional given the project's current maturity. Hardware-in-loop testing should remain a manual pre-release validation step.

The key to successful E2E testing is discipline: add tests only where they provide unique value that unit tests cannot, and maintain them aggressively to prevent flakiness and rot.
