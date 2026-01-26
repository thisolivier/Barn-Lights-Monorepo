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
