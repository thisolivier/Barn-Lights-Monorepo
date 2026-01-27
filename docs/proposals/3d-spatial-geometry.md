# Planning Document: 3D Spatial Geometry Support

**Version:** 1.0
**Date:** 2026-01-27
**Status:** Draft
**Depends on:** None (independent feature)

---

## 1. Overview

### 1.1 Purpose

Extend the LED control system to support complex 3D spatial arrangements beyond the current 2D flat-plane model. This enables:

- LED strips forming loops hanging in 3D space
- Curved surfaces and irregular arrangements
- Mixed fixture types at arbitrary positions
- Volumetric effects that span the entire space

### 1.2 Current Limitation

The existing system assumes all LEDs lie on 2D planes:

```json
// Current v1 format - sections are horizontal lines at fixed Y
{ "id": "b6", "led_count": 124, "y": 0.8, "x0": 1, "x1": 2.05 }
```

This works for "two flat sides of a room" but cannot represent:
- 3D positions (loops hanging from ceiling)
- Curved paths (arcs, spirals)
- Arbitrary point clouds (scanned installations)

### 1.3 Goals

- New config format supporting 3D geometries
- Path interpolation for smooth curves
- Backward compatibility with v1 configs
- Foundation for volumetric effects

### 1.4 Non-Goals (for initial version)

- Volumetric rendering engine (use 2D slices or per-fixture sampling initially)
- Real-time geometry editing
- Automatic LED position scanning/calibration

---

## 2. Effects-Driven Design

**Important**: Before finalizing the geometry protocol, we need to understand what effects we want to build and how we want to curate the lights.

### 2.1 The Problem with Premature Abstraction

The current 2D plane model works well for canvas-based effects because:
- Effects render to a 2D buffer (512×128)
- Each LED section samples a horizontal slice of that buffer
- Mental model is intuitive: "paint on a canvas, LEDs show the result"

However, this model breaks down with complex installations:

| Scenario | 2D Plane Problem |
|----------|------------------|
| **Floating loops in center of room** | Where do they sample from? They're not on any wall. |
| **Spotlights as wider samplers** | A spot illuminates a cone of space, not a single point. |
| **Per-fixture logic** | A hanging loop might want its own animation independent of wall effects. |
| **Depth-aware effects** | A wave moving "through" the room needs Z-axis awareness. |

### 2.2 Questions to Answer Before Implementation

1. **What effects do we actually want?**
   - Pure spatial sampling (LEDs show what's "at their position" in a 3D volume)?
   - Per-fixture effects (each strip/loop runs its own animation)?
   - Hybrid (spatial for ambient, per-fixture for accents)?

2. **How should floating elements behave?**
   - Sample from a 3D volumetric effect?
   - Sample from a 2D plane projected into space?
   - Run independent effects with color coordination?

3. **How should spotlights integrate?**
   - Sample color at their position (like a single LED)?
   - Sample average color from a region they illuminate?
   - Have their own control logic (scenes, fades)?

4. **What's the mental model for effect creators?**
   - "3D canvas" they paint in volumetric space?
   - "2D canvas" that gets mapped/projected onto 3D fixtures?
   - "Per-fixture recipes" that get coordinated centrally?

### 2.3 Proposed Approach: Layered Abstraction

Rather than forcing everything through one model, support multiple sampling modes per fixture:

```json
{
  "id": "hanging-loop-1",
  "type": "led_strip",
  "geometry": { "type": "path", "..." : "..." },
  "sampling": {
    "mode": "spatial_3d",      // Sample from 3D volume at LED positions
    "fallback": "fixture_uv"   // If no 3D effect, sample along fixture's local UV
  }
}
```

```json
{
  "id": "spot-corner",
  "type": "bridge_spot",
  "geometry": { "type": "point", "position": [2, 2.8, 1] },
  "sampling": {
    "mode": "region_average",  // Average color from a region
    "region": { "type": "sphere", "radius": 0.5 }
  }
}
```

```json
{
  "id": "accent-strip",
  "type": "led_strip",
  "geometry": { "type": "line", "..." : "..." },
  "sampling": {
    "mode": "independent",     // This fixture runs its own effect
    "effect": "chase",
    "sync_color": true         // But takes base color from main effect
  }
}
```

### 2.4 Recommendation

**Start simple, expand based on real needs:**

1. **Phase 1**: Implement basic 3D positions with spatial sampling (sample from 2D scene at normalized XY, ignore Z initially)
2. **Phase 2**: Add per-fixture UV sampling (effects along the strip's length)
3. **Phase 3**: Add volumetric sampling if/when 3D effects are actually needed
4. **Phase 4**: Add independent fixture effects if coordination proves too limiting

This lets us ship 3D geometry support without solving the full volumetric rendering problem upfront.

---

## 3. Configuration Format (v2)

### 3.1 Design Goals

- **3D positioning**: Full XYZ coordinates for each LED
- **Multiple geometry types**: Lines, paths, points, explicit positions
- **Per-fixture addressing**: Each fixture has its own output configuration
- **Backwards compatibility**: Auto-migration from v1 configs
- **Grouped control**: Treat fixtures as single units when desired

### 3.2 Schema Definition

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "version": { "const": 2 },
    "name": { "type": "string" },
    "space": {
      "type": "object",
      "description": "Defines the 3D coordinate space for effect sampling",
      "properties": {
        "type": { "enum": ["cartesian", "cylindrical", "spherical"] },
        "bounds": {
          "type": "object",
          "properties": {
            "x": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
            "y": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
            "z": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 }
          }
        }
      }
    },
    "fixtures": {
      "type": "array",
      "items": { "$ref": "#/$defs/fixture" }
    }
  },
  "$defs": {
    "fixture": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "type": { "enum": ["led_strip", "bridge_spot", "dmx_fixture"] },
        "group": { "type": "string", "description": "Optional group for unified control" },
        "output": { "$ref": "#/$defs/output" },
        "geometry": { "$ref": "#/$defs/geometry" },
        "sampling": { "$ref": "#/$defs/sampling" },
        "parameters": { "type": "object", "description": "Fixture-specific parameters" }
      },
      "required": ["id", "type", "output", "geometry"]
    },
    "geometry": {
      "oneOf": [
        { "$ref": "#/$defs/geometry_line" },
        { "$ref": "#/$defs/geometry_path" },
        { "$ref": "#/$defs/geometry_point" },
        { "$ref": "#/$defs/geometry_explicit" }
      ]
    },
    "geometry_line": {
      "type": "object",
      "description": "LED strip as a straight line in 3D space",
      "properties": {
        "type": { "const": "line" },
        "led_count": { "type": "integer" },
        "start": { "$ref": "#/$defs/point3d" },
        "end": { "$ref": "#/$defs/point3d" }
      },
      "required": ["type", "led_count", "start", "end"]
    },
    "geometry_path": {
      "type": "object",
      "description": "LED strip following a curved path defined by control points",
      "properties": {
        "type": { "const": "path" },
        "led_count": { "type": "integer" },
        "interpolation": { "enum": ["linear", "catmull-rom", "bezier"], "default": "catmull-rom" },
        "control_points": {
          "type": "array",
          "items": { "$ref": "#/$defs/point3d" },
          "minItems": 2
        },
        "closed": { "type": "boolean", "default": false }
      },
      "required": ["type", "led_count", "control_points"]
    },
    "geometry_point": {
      "type": "object",
      "description": "Single point in space (for spotlights, single fixtures)",
      "properties": {
        "type": { "const": "point" },
        "position": { "$ref": "#/$defs/point3d" },
        "aim": { "$ref": "#/$defs/point3d", "description": "Direction the fixture points" }
      },
      "required": ["type", "position"]
    },
    "geometry_explicit": {
      "type": "object",
      "description": "Explicit per-LED positions (for complex/scanned layouts)",
      "properties": {
        "type": { "const": "explicit" },
        "positions": {
          "type": "array",
          "items": { "$ref": "#/$defs/point3d" }
        }
      },
      "required": ["type", "positions"]
    },
    "point3d": {
      "type": "array",
      "items": { "type": "number" },
      "minItems": 3,
      "maxItems": 3,
      "description": "[x, y, z] coordinates"
    },
    "sampling": {
      "type": "object",
      "description": "How this fixture samples colors from effects",
      "properties": {
        "mode": {
          "enum": ["spatial_3d", "spatial_2d", "fixture_uv", "region_average", "independent"],
          "default": "spatial_2d"
        },
        "fallback": { "type": "string" },
        "region": { "type": "object" }
      }
    },
    "output": {
      "oneOf": [
        { "$ref": "#/$defs/udp_output" },
        { "$ref": "#/$defs/http_output" }
      ]
    },
    "udp_output": {
      "type": "object",
      "properties": {
        "protocol": { "const": "udp" },
        "ip": { "type": "string" },
        "port": { "type": "integer" },
        "run_index": { "type": "integer" }
      },
      "required": ["protocol", "ip", "port"]
    },
    "http_output": {
      "type": "object",
      "properties": {
        "protocol": { "const": "http" },
        "bridge_url": { "type": "string" },
        "light_id": { "type": "string" }
      },
      "required": ["protocol", "bridge_url", "light_id"]
    }
  }
}
```

### 3.3 Geometry Types Explained

#### 3.3.1 Line

Straight line between two points in 3D space. LEDs are evenly distributed along the line.

```json
{
  "type": "line",
  "led_count": 124,
  "start": [1.0, 2.4, 0.0],
  "end": [2.05, 2.4, 0.0]
}
```

**Use case**: Wall-mounted strips, linear fixtures.

#### 3.3.2 Path

Curved path through multiple control points with interpolation. Supports open and closed (loop) paths.

```json
{
  "type": "path",
  "led_count": 200,
  "interpolation": "catmull-rom",
  "closed": true,
  "control_points": [
    [3.0, 2.5, 2.0],
    [4.0, 2.2, 3.0],
    [5.0, 2.5, 4.0],
    [4.5, 2.8, 3.5],
    [3.5, 2.8, 2.5]
  ]
}
```

**Use case**: Hanging loops, curved installations, spirals.

**Interpolation options**:
- `linear`: Straight segments between points
- `catmull-rom`: Smooth curve passing through all points (recommended)
- `bezier`: Bezier curve with explicit control handles

#### 3.3.3 Point

Single position in space. Used for spotlights and single-point fixtures.

```json
{
  "type": "point",
  "position": [2.0, 2.8, 1.0],
  "aim": [2.0, 0.0, 4.0]
}
```

**Use case**: Bluetooth spotlights, DMX fixtures.

#### 3.3.4 Explicit

Array of explicit 3D positions for each LED. Used for complex or scanned layouts.

```json
{
  "type": "explicit",
  "positions": [
    [5.0, 2.8, 4.0],
    [5.1, 2.7, 4.1],
    [5.15, 2.6, 4.05],
    [5.1, 2.5, 3.95],
    [5.0, 2.4, 4.0]
  ]
}
```

**Use case**: Irregular arrangements, imported from 3D scanning or CAD.

---

## 4. Path Interpolation

### 4.1 Position Computation

```javascript
// src/core/geometry.mjs

/**
 * Compute LED positions from geometry definition
 * Returns array of [x, y, z] positions
 */
export function computePositions(geometry) {
  switch (geometry.type) {
    case 'line':
      return computeLinePositions(geometry);
    case 'path':
      return computePathPositions(geometry);
    case 'point':
      return [geometry.position];
    case 'explicit':
      return geometry.positions;
    default:
      throw new Error(`Unknown geometry type: ${geometry.type}`);
  }
}

function computeLinePositions({ led_count, start, end }) {
  const positions = [];
  for (let i = 0; i < led_count; i++) {
    const t = led_count > 1 ? i / (led_count - 1) : 0;
    positions.push([
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t
    ]);
  }
  return positions;
}

function computePathPositions({ led_count, control_points, interpolation, closed }) {
  const positions = [];

  // Extend control points for closed paths
  const points = closed
    ? [...control_points, control_points[0], control_points[1]]
    : control_points;

  for (let i = 0; i < led_count; i++) {
    const t = closed
      ? i / led_count  // Don't include endpoint for closed
      : (led_count > 1 ? i / (led_count - 1) : 0);

    let position;
    switch (interpolation) {
      case 'linear':
        position = linearInterpolate(points, t);
        break;
      case 'catmull-rom':
        position = catmullRomInterpolate(points, t);
        break;
      case 'bezier':
        position = bezierInterpolate(points, t);
        break;
      default:
        position = linearInterpolate(points, t);
    }
    positions.push(position);
  }

  return positions;
}
```

### 4.2 Catmull-Rom Interpolation

Produces smooth curves that pass through all control points:

```javascript
function catmullRomInterpolate(points, t) {
  const n = points.length - 1;
  const segment = Math.min(Math.floor(t * n), n - 1);
  const localT = (t * n) - segment;

  // Get 4 control points (with clamping at edges)
  const p0 = points[Math.max(0, segment - 1)];
  const p1 = points[segment];
  const p2 = points[Math.min(n, segment + 1)];
  const p3 = points[Math.min(n, segment + 2)];

  // Catmull-Rom interpolation formula
  const t2 = localT * localT;
  const t3 = t2 * localT;

  return [0, 1, 2].map(axis => {
    const a = -0.5 * p0[axis] + 1.5 * p1[axis] - 1.5 * p2[axis] + 0.5 * p3[axis];
    const b = p0[axis] - 2.5 * p1[axis] + 2 * p2[axis] - 0.5 * p3[axis];
    const c = -0.5 * p0[axis] + 0.5 * p2[axis];
    const d = p1[axis];
    return a * t3 + b * t2 + c * localT + d;
  });
}
```

### 4.3 Linear Interpolation

Simple straight-line segments between points:

```javascript
function linearInterpolate(points, t) {
  const n = points.length - 1;
  const segment = Math.min(Math.floor(t * n), n - 1);
  const localT = (t * n) - segment;

  const p1 = points[segment];
  const p2 = points[segment + 1];

  return [
    p1[0] + (p2[0] - p1[0]) * localT,
    p1[1] + (p2[1] - p1[1]) * localT,
    p1[2] + (p2[2] - p1[2]) * localT
  ];
}
```

---

## 5. Sampling Strategies

### 5.1 Spatial 2D (Default)

Sample from a 2D scene buffer using XY coordinates, ignoring Z. This is backward-compatible with existing effects.

```javascript
function sampleSpatial2D(sceneF32, W, H, positions, bounds) {
  return positions.map(([px, py, pz]) => {
    // Normalize XY to scene coordinates
    const nx = (px - bounds.x[0]) / (bounds.x[1] - bounds.x[0]);
    const ny = (py - bounds.y[0]) / (bounds.y[1] - bounds.y[0]);

    const sx = nx * (W - 1);
    const sy = ny * (H - 1);

    return bilinearSampleRGB(sceneF32, W, H, sx, sy);
  });
}
```

### 5.2 Spatial 3D

Sample from a 3D volumetric effect using full XYZ coordinates:

```javascript
function sampleSpatial3D(sceneVolume, positions, bounds) {
  const { x: [xMin, xMax], y: [yMin, yMax], z: [zMin, zMax] } = bounds;
  const [W, H, D] = sceneVolume.dimensions;

  return positions.map(([px, py, pz]) => {
    const nx = (px - xMin) / (xMax - xMin);
    const ny = (py - yMin) / (yMax - yMin);
    const nz = (pz - zMin) / (zMax - zMin);

    const sx = nx * (W - 1);
    const sy = ny * (H - 1);
    const sz = nz * (D - 1);

    return trilinearSampleRGB(sceneVolume.data, W, H, D, sx, sy, sz);
  });
}
```

### 5.3 Fixture UV

Sample along the fixture's local coordinate (0 to 1 along its length). Useful for chase effects, gradients along a strip.

```javascript
function sampleFixtureUV(effect, led_count) {
  const colors = [];
  for (let i = 0; i < led_count; i++) {
    const u = led_count > 1 ? i / (led_count - 1) : 0;
    colors.push(effect.sampleAtU(u));
  }
  return colors;
}
```

### 5.4 Region Average

For spotlights, average color from a spherical region around their position:

```javascript
function sampleRegionAverage(sceneF32, W, H, position, region, bounds) {
  // Sample multiple points within the region and average
  const samples = [];
  const { radius } = region;

  for (let i = 0; i < 8; i++) {  // 8 sample points
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = Math.random() * radius;

    const px = position[0] + r * Math.sin(phi) * Math.cos(theta);
    const py = position[1] + r * Math.sin(phi) * Math.sin(theta);
    const pz = position[2] + r * Math.cos(phi);

    samples.push(sampleSpatial2D(sceneF32, W, H, [[px, py, pz]], bounds)[0]);
  }

  // Average all samples
  return [
    samples.reduce((sum, s) => sum + s[0], 0) / samples.length,
    samples.reduce((sum, s) => sum + s[1], 0) / samples.length,
    samples.reduce((sum, s) => sum + s[2], 0) / samples.length
  ];
}
```

---

## 6. Migration from v1

### 6.1 Auto-Detection

The config loader detects version and migrates automatically:

```javascript
function loadConfig(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));

  if (raw.version === 2) {
    return raw;
  }

  // v1 format detected - migrate
  return migrateV1ToV2(raw);
}
```

### 6.2 Migration Logic

```javascript
function migrateV1ToV2(v1Config) {
  const fixtures = [];

  for (const run of v1Config.runs) {
    for (const section of run.sections) {
      fixtures.push({
        id: section.id,
        type: 'led_strip',
        output: {
          protocol: 'udp',
          ip: v1Config.static_ip.join('.'),
          port: v1Config.port_base,
          run_index: run.run_index
        },
        geometry: {
          type: 'line',
          led_count: section.led_count,
          start: [section.x0, section.y, 0],
          end: [section.x1, section.y, 0]
        }
      });
    }
  }

  return {
    version: 2,
    name: v1Config.side,
    space: {
      type: 'cartesian',
      bounds: {
        x: [0, v1Config.sampling.width],
        y: [0, v1Config.sampling.height],
        z: [0, 0.1]  // Flat plane
      }
    },
    fixtures
  };
}
```

### 6.3 Example Migration

**v1 input:**
```json
{
  "side": "left",
  "runs": [{
    "run_index": 0,
    "sections": [
      { "id": "b6", "led_count": 124, "y": 0.8, "x0": 1, "x1": 2.05 }
    ]
  }],
  "sampling": { "width": 7.0, "height": 1.0 }
}
```

**v2 output:**
```json
{
  "version": 2,
  "name": "left",
  "space": {
    "type": "cartesian",
    "bounds": { "x": [0, 7], "y": [0, 1], "z": [0, 0.1] }
  },
  "fixtures": [{
    "id": "b6",
    "type": "led_strip",
    "output": { "protocol": "udp", "ip": "10.10.0.2", "port": 49600, "run_index": 0 },
    "geometry": {
      "type": "line",
      "led_count": 124,
      "start": [1, 0.8, 0],
      "end": [2.05, 0.8, 0]
    }
  }]
}
```

---

## 7. Example Configurations

### 7.1 Simple Two-Wall Setup

```json
{
  "version": 2,
  "name": "two-walls",
  "space": {
    "type": "cartesian",
    "bounds": { "x": [0, 7], "y": [0, 1], "z": [0, 0.1] }
  },
  "fixtures": [
    {
      "id": "b6",
      "type": "led_strip",
      "output": { "protocol": "udp", "ip": "10.10.0.2", "port": 49600, "run_index": 0 },
      "geometry": { "type": "line", "led_count": 124, "start": [1, 0.8, 0], "end": [2.05, 0.8, 0] }
    }
  ]
}
```

### 7.2 Room with Hanging Loops and Spots

```json
{
  "version": 2,
  "name": "immersive-room",
  "space": {
    "type": "cartesian",
    "bounds": { "x": [0, 10], "y": [0, 4], "z": [0, 10] }
  },
  "fixtures": [
    {
      "id": "ceiling-loop-1",
      "type": "led_strip",
      "group": "ceiling",
      "output": { "protocol": "udp", "ip": "10.10.0.5", "port": 49640, "run_index": 0 },
      "geometry": {
        "type": "path",
        "led_count": 300,
        "interpolation": "catmull-rom",
        "closed": true,
        "control_points": [
          [3, 3.5, 3], [5, 3.2, 4], [7, 3.5, 5],
          [6, 3.8, 6], [4, 3.8, 5], [3, 3.5, 4]
        ]
      },
      "sampling": { "mode": "fixture_uv" }
    },
    {
      "id": "wall-wash-left",
      "type": "led_strip",
      "group": "walls",
      "output": { "protocol": "udp", "ip": "10.10.0.2", "port": 49600, "run_index": 0 },
      "geometry": { "type": "line", "led_count": 400, "start": [0, 0.5, 0], "end": [0, 3.5, 0] },
      "sampling": { "mode": "spatial_2d" }
    },
    {
      "id": "floor-spot-1",
      "type": "bridge_spot",
      "group": "floor-spots",
      "output": { "protocol": "http", "bridge_url": "http://bridge.local:8080", "light_id": "floor-spot-1" },
      "geometry": { "type": "point", "position": [2, 0, 5], "aim": [2, 3, 5] },
      "sampling": { "mode": "region_average", "region": { "type": "sphere", "radius": 0.5 } }
    }
  ]
}
```

---

## 8. Implementation Phases

### Phase 1: Config Format and Parsing (1 week)
- [ ] Define v2 JSON schema
- [ ] Implement config loader with v1/v2 detection
- [ ] Implement v1 → v2 migration
- [ ] Add geometry position computation (line, path, point, explicit)
- [ ] Add path interpolation (catmull-rom, linear)

### Phase 2: Renderer Integration (1 week)
- [ ] Update renderer to load v2 configs
- [ ] Implement spatial_2d sampling (default, backward compatible)
- [ ] Implement fixture_uv sampling
- [ ] Test with existing effects on new config format

### Phase 3: Advanced Sampling (1-2 weeks)
- [ ] Implement region_average for spotlights
- [ ] Design and implement spatial_3d (if needed)
- [ ] Add per-fixture sampling mode configuration
- [ ] Test with mixed fixture types

### Phase 4: Tooling (optional)
- [ ] Config visualizer (show fixtures in 3D space)
- [ ] Path editor (visual control point editing)
- [ ] Position export from 3D software (Blender, etc.)

---

## 9. Open Questions

1. **Default sampling mode**: Should floating fixtures default to `spatial_2d` (backward compatible) or `fixture_uv` (more intuitive for loops)?

2. **Coordinate system**: Is Y-up cartesian sufficient, or do we need cylindrical/spherical for certain installations?

3. **Effect authoring**: How do effect creators specify which sampling modes their effects support?

4. **Performance**: What's the cost of path interpolation at 60fps for 1000+ LEDs?

5. **Visualization**: Do we need a real-time 3D preview tool during setup?

---

## 10. Appendix: Coordinate Conventions

### 10.1 Cartesian (Default)

```
      Y (up)
      │
      │
      │
      └────────── X (right)
     /
    /
   Z (forward/depth)
```

- **X**: Left-right (0 = left wall)
- **Y**: Up-down (0 = floor)
- **Z**: Front-back (0 = back wall)

### 10.2 Units

Coordinates are in **meters** by default. The `bounds` field defines the extent of the space.

```json
"bounds": {
  "x": [0, 10],   // Room is 10m wide
  "y": [0, 4],    // Room is 4m tall
  "z": [0, 8]     // Room is 8m deep
}
```
