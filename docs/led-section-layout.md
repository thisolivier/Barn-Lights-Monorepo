# LED Section Layout Configuration

This document describes how LED sections are configured in layout files and how reversed sections are handled throughout the system.

## Layout File Structure

Layout files (`config/left.json`, `config/right.json`, etc.) define the physical arrangement of LED strips:

```json
{
  "side": "left",
  "total_leds": 1024,
  "sampling": {
    "space": "normalized",
    "width": 7.2,
    "height": 1.0
  },
  "runs": [
    {
      "run_index": 0,
      "led_count": 256,
      "sections": [
        {
          "id": "b6",
          "led_count": 128,
          "y": 0.6,
          "x0": 1.0,
          "x1": 2.05
        }
      ]
    }
  ]
}
```

## Section Coordinates

Each section has:
- `x0`: Starting x-coordinate in normalized sampling space
- `x1`: Ending x-coordinate in normalized sampling space
- `y`: Y-coordinate (height) in normalized sampling space
- `led_count`: Number of LEDs in this section

## Reversed Sections

Some physical LED strips are wired "backwards" due to installation constraints or wiring optimizations. These are represented with **x0 > x1**:

```json
{
  "id": "b7",
  "led_count": 128,
  "y": 0.5,
  "x0": 2.05,
  "x1": 1.0
}
```

In this example, the first physical LED (index 0) is at x=2.05, and the last LED is at x=1.0.

### Current Reversed Sections

In `config/left.json`:
- **b7**: x0=2.05, x1=1.0
- **b8**: x0=0.9, x1=0.0

## How Reversal is Handled

The system uses a two-stage approach to handle reversed sections:

### Stage 1: Renderer (Visual Order)

The renderer's `sliceSection()` function samples pixels from x0 to x1:

```javascript
for (let i = 0; i < led_count; i++) {
  const t = i / (led_count - 1);
  const xNorm = x0 + (x1 - x0) * t;  // Interpolates x0 → x1
  // Sample pixel at (xNorm, y)
}
```

For a reversed section (x0=2.05, x1=1.0), this samples right-to-left, outputting pixels in **visual order**.

### Stage 2: Sender Assembler (Physical Order)

The assembler detects reversed sections and flips the RGB data:

```javascript
const needsFlip = x1 < x0;
if (needsFlip) {
  // Reverse RGB triplets: [LED0, LED1, LED2] → [LED2, LED1, LED0]
}
```

This converts from visual order to **physical LED order** for transmission.

### Stage 3: Firmware

The firmware receives RGB data in physical order and displays it directly. No reversal logic is needed at this level.

## Data Flow Example

For section b7 (reversed, x0=2.05, x1=1.0) displaying a red→blue gradient:

| Stage | Data Order | Description |
|-------|------------|-------------|
| Scene | [red...blue] | Gradient in scene buffer |
| Renderer output | [blue, mid, red] | Sampled right→left (visual order) |
| Assembler output | [red, mid, blue] | Flipped to physical LED order |
| Firmware display | LED0=red, LED1=mid, LED2=blue | Correct visual result |

## Adding New Sections

When adding sections to layout files:

1. **Normal wiring** (LED0 at left): Use `x0 < x1`
2. **Reversed wiring** (LED0 at right): Use `x0 > x1`

Both x0 and x1 must be within the sampling space bounds (0 to `sampling.width`).

## Validation

The renderer test suite validates that all section coordinates are within bounds, allowing both normal and reversed sections:

```javascript
const xMin = Math.min(sec.x0, sec.x1);
const xMax = Math.max(sec.x0, sec.x1);
assert(xMin >= 0 && xMax <= width);
```
