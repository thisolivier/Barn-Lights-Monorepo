# BarnLights Playbox (test harness)

Minimal Node + browser setup that:
- renders gradients / solid / fire onto a 2D virtual scene per side,
- applies strobe / brightness / tint / roll / gamma,
- samples per your layout JSON into per-row "slices",
- **emits SLICES_NDJSON to stdout** (one line per frame),
- serves a **live preview** with a light barn perspective and per-LED colored dots.

## Quick start
```bash
npm i
npm start  # UI: http://localhost:8080
