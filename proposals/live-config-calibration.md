# Live Config Calibration Tools - Research Proposal

## Executive Summary

This document proposes a system for live-tweaking and validating LED configuration files, including diagnostic effects for position validation and section-by-section LED verification.

## 1. How to Modify Configs Live

### Current Architecture Constraints

The system has two categories of parameters:

| Category | Modifiable at Runtime | Examples |
|----------|----------------------|----------|
| **Rendering Parameters** | ✅ Yes (via WebSocket) | effect, brightness, gamma, tint, pitch/yaw |
| **Layout Structure** | ❌ No | x0, x1, y positions, section IDs, LED counts |

**Why layout is immutable:**
1. **Scene Sampling** - LED positions (`x0`, `x1`, `y`) directly determine which scene pixels map to each LED. Changing mid-frame causes color discontinuities.
2. **NDJSON Contract** - Section IDs are hardwired between renderer and sender.
3. **UDP Routing** - `run_index` determines port numbers; devices listen on fixed ports.
4. **Device Firmware** - ESP32 pre-allocates buffers based on LED count at compile time.

### Proposed Solution: Config Hot-Reload with Safe Transition

Implement a controlled reload mechanism:

```
┌─────────────────────────────────────────────────────────────┐
│  1. User edits config file (or uses calibration UI)         │
│  2. Renderer detects change (file watcher)                  │
│  3. Renderer validates new config                           │
│  4. Renderer emits TRANSITION frame (fade to black)         │
│  5. Renderer re-initializes with new layout                 │
│  6. Sender receives LAYOUT_CHANGE event, re-initializes     │
│  7. Normal frame output resumes                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Requirements:**

#### Renderer Changes (`packages/renderer/`)
```javascript
// Add to engine.mjs
import { watch } from 'chokidar';

function initLayoutWatcher(configDir) {
  const watcher = watch([
    path.join(configDir, 'left.json'),
    path.join(configDir, 'right.json')
  ], { persistent: true });

  watcher.on('change', async (filePath) => {
    console.error(`[CONFIG] Detected change: ${filePath}`);
    await reloadLayout(filePath);
  });
}

async function reloadLayout(filePath) {
  // 1. Validate new config before applying
  const newLayout = await loadAndValidate(filePath);
  if (!newLayout.valid) {
    console.error(`[CONFIG] Invalid config: ${newLayout.error}`);
    return;
  }

  // 2. Emit transition marker
  emitFrame({ type: 'layout_transition', status: 'starting' });

  // 3. Swap layouts
  if (filePath.includes('left')) {
    layoutLeft = newLayout.data;
  } else {
    layoutRight = newLayout.data;
  }

  // 4. Signal completion
  emitFrame({ type: 'layout_transition', status: 'complete' });
}
```

#### Sender Changes (`packages/sender/`)
```javascript
// Add to assembler/index.mjs
function handleLayoutTransition(frame) {
  if (frame.type === 'layout_transition') {
    if (frame.status === 'starting') {
      // Drain in-flight packets, prepare for new layout
      this.transitionMode = true;
    } else if (frame.status === 'complete') {
      // Reload layout config
      this.reloadLayouts();
      this.transitionMode = false;
    }
    return;
  }
  // Normal frame processing...
}
```

### What CAN Be Modified Live

| Property | How to Modify | Notes |
|----------|---------------|-------|
| `section.x0, x1` | Config reload | Affects scene sampling position |
| `section.y` | Config reload | Affects scene sampling position |
| `section.id` | Config reload | Requires sender restart if renamed |
| `sampling.width/height` | Config reload | Changes coordinate normalization |

### What CANNOT Be Modified Live

| Property | Limitation |
|----------|-----------|
| `runs[].led_count` | **Hardware constraint** - ESP32 allocates fixed buffers |
| `total_leds` | Sum of `led_count`, cannot exceed hardware |
| `run_index` | Device listens on fixed ports per run |
| `static_ip`, `port_base` | Network addressing is firmware-configured |

---

## 2. Diagnostic Tools to Develop

### Tool 1: Line Scanner Effect

**Purpose:** Validate X and Y positions by sweeping a visible line across the scene.

```javascript
// /packages/renderer/src/effects/library/lineScanner.mjs
export const lineScanner = {
  id: 'lineScanner',
  displayName: 'Line Scanner (Calibration)',
  defaultParams: {
    mode: 'horizontal',    // 'horizontal' | 'vertical'
    position: 0.5,         // Manual position (0-1)
    autoSweep: true,       // Auto-animate
    sweepSpeed: 0.5,       // Sweeps per second
    lineWidth: 0.02,       // Width as fraction of scene
    lineColor: [1, 1, 1],  // RGB
    bgColor: [0, 0, 0.1]   // Dim background for visibility
  },
  paramSchema: {
    mode: { type: 'select', options: ['horizontal', 'vertical'], label: 'Sweep Direction' },
    position: { type: 'range', min: 0, max: 1, step: 0.01, label: 'Line Position' },
    autoSweep: { type: 'boolean', label: 'Auto Sweep' },
    sweepSpeed: { type: 'range', min: 0.1, max: 2, step: 0.1, label: 'Sweep Speed' },
    lineWidth: { type: 'range', min: 0.01, max: 0.1, step: 0.01, label: 'Line Width' }
  },
  render(sceneF32, W, H, t, params) {
    const {
      mode, position, autoSweep, sweepSpeed, lineWidth, lineColor, bgColor
    } = params;

    // Calculate line position
    const linePos = autoSweep
      ? (t * sweepSpeed) % 1  // Sawtooth wave 0→1
      : position;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 3;

        // Normalized coordinates
        const xNorm = x / (W - 1);
        const yNorm = y / (H - 1);

        // Check if pixel is on the line
        const testCoord = mode === 'horizontal' ? yNorm : xNorm;
        const onLine = Math.abs(testCoord - linePos) < lineWidth / 2;

        if (onLine) {
          sceneF32[idx] = lineColor[0];
          sceneF32[idx + 1] = lineColor[1];
          sceneF32[idx + 2] = lineColor[2];
        } else {
          sceneF32[idx] = bgColor[0];
          sceneF32[idx + 1] = bgColor[1];
          sceneF32[idx + 2] = bgColor[2];
        }
      }
    }
  }
};
```

**Usage:**
1. Set `mode: 'horizontal'` and watch which LEDs light up at each Y position
2. Set `mode: 'vertical'` and verify X positions
3. Use `autoSweep: false` and manually set `position` to pinpoint exact coordinates
4. Compare observed LED positions against config file values

---

### Tool 2: Section Highlighter

**Purpose:** Light up one section at a time to verify section boundaries and LED counts.

```javascript
// /packages/renderer/src/effects/library/sectionHighlight.mjs
export const sectionHighlight = {
  id: 'sectionHighlight',
  displayName: 'Section Highlighter (Calibration)',
  defaultParams: {
    side: 'left',           // 'left' | 'right' | 'both'
    sectionIndex: 0,        // Which section to highlight
    autoAdvance: true,      // Cycle through sections
    advanceInterval: 2,     // Seconds per section
    showGradient: true,     // Show position gradient within section
    highlightColor: [1, 1, 1],
    dimColor: [0.05, 0.05, 0.05]
  },
  paramSchema: {
    side: { type: 'select', options: ['left', 'right', 'both'], label: 'Wall' },
    sectionIndex: { type: 'range', min: 0, max: 50, step: 1, label: 'Section Index' },
    autoAdvance: { type: 'boolean', label: 'Auto Cycle' },
    advanceInterval: { type: 'range', min: 0.5, max: 10, step: 0.5, label: 'Cycle Interval (s)' },
    showGradient: { type: 'boolean', label: 'Show Position Gradient' }
  },
  // Note: This effect needs layout access - render function would receive layout context
  render(sceneF32, W, H, t, params, layoutLeft, layoutRight) {
    // Implementation draws bright colors only in the active section's region
    // Gradient mode: LED 0 = red, LED n = blue, interpolate between
  }
};
```

**Usage:**
1. Select a wall (`left` or `right`)
2. Watch each section light up in sequence
3. Count lit LEDs to verify `led_count` matches physical strip
4. With `showGradient: true`, verify LED 0 (red) and LED n (blue) are at correct ends

---

### Tool 3: Position Validator

**Purpose:** Test specific coordinates by lighting up a single point.

```javascript
// /packages/renderer/src/effects/library/positionValidator.mjs
export const positionValidator = {
  id: 'positionValidator',
  displayName: 'Position Validator (Calibration)',
  defaultParams: {
    testX: 0.5,            // Normalized X to test (0-1)
    testY: 0.5,            // Normalized Y to test (0-1)
    pointSize: 0.03,       // Radius as fraction
    showGrid: true,        // Show reference grid
    gridSpacing: 0.1,      // Grid line spacing
    pointColor: [1, 0, 0], // Bright red test point
    gridColor: [0.1, 0.1, 0.1]
  },
  paramSchema: {
    testX: { type: 'range', min: 0, max: 1, step: 0.01, label: 'Test X' },
    testY: { type: 'range', min: 0, max: 1, step: 0.01, label: 'Test Y' },
    pointSize: { type: 'range', min: 0.01, max: 0.1, step: 0.01, label: 'Point Size' },
    showGrid: { type: 'boolean', label: 'Show Grid' },
    gridSpacing: { type: 'range', min: 0.05, max: 0.25, step: 0.05, label: 'Grid Spacing' }
  },
  render(sceneF32, W, H, t, params) {
    // Draws grid lines + bright point at test coordinates
  }
};
```

**Usage:**
1. Read a section's `x0`, `x1`, `y` from config
2. Enter those values into `testX`/`testY`
3. Verify the lit LEDs match the expected physical location
4. Adjust config values and reload to correct positions

---

### Tool 4: LED Counter

**Purpose:** Sequential LED lighting to count LEDs in each section.

```javascript
// /packages/renderer/src/effects/library/ledCounter.mjs
export const ledCounter = {
  id: 'ledCounter',
  displayName: 'LED Counter (Calibration)',
  defaultParams: {
    side: 'left',
    runIndex: 0,
    sectionId: '',         // Empty = all sections in run
    speed: 10,             // LEDs per second
    pauseAtEnd: true,      // Pause when reaching end of section
    showNumber: true       // Display LED number (via position encoding)
  },
  // This effect would light LEDs sequentially 1-by-1
  // Useful for physically counting LEDs and verifying led_count
};
```

---

### Tool 5: Calibration Web UI

**Purpose:** Browser-based interface for editing config and seeing results live.

```
┌─────────────────────────────────────────────────────────────┐
│  LED Calibration Tool                                       │
├─────────────────────────────────────────────────────────────┤
│  [Left Wall] [Right Wall]                                   │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │  Preview Canvas (512×128 with LED overlays)      │      │
│  │  ● ● ● ● ● ● ● ● ● ● ●  Section b6              │      │
│  │  ● ● ● ● ● ● ● ● ● ●    Section b7              │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  Selected Section: [b6 ▼]                                   │
│  ├─ x0: [====●===] 0.14                                    │
│  ├─ x1: [=======●] 0.29                                    │
│  ├─ y:  [●=======] 0.80                                    │
│  └─ led_count: 124 (read-only)                             │
│                                                             │
│  Diagnostic Effect: [Line Scanner ▼]                        │
│  ├─ Mode: [Horizontal ▼]                                   │
│  └─ Position: [====●===] 0.50                              │
│                                                             │
│  [Save Config] [Revert Changes] [Export]                    │
└─────────────────────────────────────────────────────────────┘
```

**Implementation:**
- Add `/calibration` route to server
- Serve dedicated calibration React component
- WebSocket for live parameter updates
- HTTP POST to save config changes

---

## 3. Limitations

### Hardware Constraints (Cannot Change)

| Limitation | Reason | Workaround |
|------------|--------|------------|
| **Total LED count per run** | ESP32 firmware pre-allocates fixed buffers at compile time | Must reflash device to change |
| **Number of runs** | UDP ports are fixed per run_index | Must reflash device |
| **Run index assignment** | Device expects specific data on specific ports | Reconfigure firmware |

### Protocol Constraints

| Limitation | Reason | Workaround |
|------------|--------|------------|
| **Section ID changes** | NDJSON contract between renderer and sender | Restart both services |
| **Network addressing** | Device has static IP configuration | Reconfigure device network |

### Practical Constraints

| Limitation | Impact |
|------------|--------|
| **Brief blackout during config reload** | ~100-200ms of no output during transition |
| **No mid-frame changes** | Changes apply at next frame boundary |
| **UI preview vs physical may differ** | Browser preview is approximation |

### What IS Adjustable Live

These properties CAN be changed with config hot-reload:

| Property | Effect |
|----------|--------|
| `section.x0` | Shifts section start position |
| `section.x1` | Shifts section end position |
| `section.y` | Moves section vertically |
| `sampling.width` | Scales entire coordinate system |
| `sampling.height` | Scales entire coordinate system |

---

## 4. Implementation Roadmap

### Phase 1: Diagnostic Effects (Low Risk)
1. Create `lineScanner.mjs` effect
2. Create `sectionHighlight.mjs` effect
3. Create `positionValidator.mjs` effect
4. Register effects in effect index
5. Test via existing WebSocket UI

### Phase 2: Config Hot-Reload (Medium Risk)
1. Add chokidar file watcher to renderer
2. Implement config validation on change
3. Add transition frame protocol
4. Update sender to handle transitions
5. Test reload scenarios

### Phase 3: Calibration UI (Medium Risk)
1. Design calibration page component
2. Add `/calibration` route
3. Implement section editor controls
4. Add config save endpoint
5. Integrate with diagnostic effects

### Phase 4: Advanced Features (Optional)
1. LED counter effect for physical verification
2. Config diff/merge tool
3. Undo/redo for calibration changes
4. Export config as backup

---

## 5. Files to Modify

### New Files
- `packages/renderer/src/effects/library/lineScanner.mjs`
- `packages/renderer/src/effects/library/sectionHighlight.mjs`
- `packages/renderer/src/effects/library/positionValidator.mjs`
- `packages/renderer/src/effects/library/ledCounter.mjs`
- `packages/renderer/src/ui/CalibrationPage.jsx` (optional)

### Modified Files
- `packages/renderer/src/effects/index.mjs` - Register new effects
- `packages/renderer/src/engine.mjs` - Add file watcher
- `packages/renderer/src/server.mjs` - Add calibration routes (optional)
- `packages/sender/src/assembler/index.mjs` - Handle transition frames

---

## Summary

**Key Answers:**

1. **How to modify configs live:** Implement config file watching with safe transition protocol. Position parameters (x0, x1, y) can be modified; LED counts cannot.

2. **Best tools to develop:**
   - Line Scanner (horizontal/vertical sweep for position validation)
   - Section Highlighter (verify section boundaries and counts)
   - Position Validator (test specific coordinates)
   - Calibration Web UI (edit configs with live preview)

3. **Limitations:**
   - LED count per run is hardware-bound (cannot change without reflash)
   - Number of runs and run indices are fixed
   - Brief blackout (~100-200ms) during config reload
   - Section ID changes require service restart
