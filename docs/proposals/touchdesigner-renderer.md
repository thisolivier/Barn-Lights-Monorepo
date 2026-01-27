# Planning Document: TouchDesigner as Alternative Renderer

**Version:** 1.0
**Date:** 2026-01-27
**Status:** Draft
**Depends on:** 3D Spatial Geometry Support (for full benefit, but can work without)

---

## 1. Overview

### 1.1 Purpose

Add TouchDesigner as an alternative renderer alongside the existing Node.js renderer. Both renderers output the same NDJSON frame format, allowing seamless switching between them.

### 1.2 Why TouchDesigner?

| Capability | Node.js Renderer | TouchDesigner |
|------------|------------------|---------------|
| **3D mapping** | Must be built | Native (POPs/SOPs) |
| **Visual editing** | Code only | Real-time visual |
| **Effect library** | Custom effects | Large ecosystem |
| **Performance** | CPU-bound | GPU-accelerated |
| **Learning curve** | JavaScript | TouchDesigner-specific |

TouchDesigner excels at:
- Complex 3D spatial mapping
- Real-time visual effect design
- GPU-accelerated rendering
- Integration with audio/video/sensors

### 1.3 Goals

- Switchable renderer via `--renderer` flag
- Same output format (NDJSON) to fixture bridge
- TouchDesigner reads same config files
- Either renderer can drive same fixtures

### 1.4 Non-Goals (for initial version)

- Real-time switching between renderers
- Bidirectional parameter sync
- TouchDesigner UI for fixture configuration

---

## 2. Architecture

### 2.1 Renderer Switching

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RENDERER LAYER                                    │
│                     (Switchable via --renderer flag)                        │
│                                                                             │
│   ┌─────────────────────────┐       ┌─────────────────────────────────────┐│
│   │    Node.js Renderer     │       │       TouchDesigner Renderer        ││
│   │   (packages/renderer)   │       │         (packages/td-renderer)      ││
│   │                         │       │                                     ││
│   │  • Effect library       │       │  • Native 3D mapping (POPs/SOPs)    ││
│   │  • 2D/3D scene buffer   │       │  • Visual effect design             ││
│   │  • Post-processing      │       │  • Real-time parameter control      ││
│   └───────────┬─────────────┘       └──────────────┬──────────────────────┘│
│               │                                    │                        │
│               │  NDJSON (stdout)                   │  NDJSON (TCP)          │
│               │                                    │                        │
└───────────────┼────────────────────────────────────┼────────────────────────┘
                │                                    │
                └──────────────┬─────────────────────┘
                               │
                               ▼
                ┌─────────────────────────────────────┐
                │          FIXTURE BRIDGE             │
                │    (packages/fixture-bridge)        │
                │                                     │
                │  • Receives NDJSON from renderer    │
                │  • Routes to output adapters        │
                │  • UDP, HTTP (Matter bridge), etc.  │
                └─────────────────────────────────────┘
```

### 2.2 Communication Protocol

**Node.js Renderer**: Outputs NDJSON to stdout (same as current system)

**TouchDesigner Renderer**: Connects via TCP to the fixture bridge

```
TouchDesigner ──TCP:49900──▶ Fixture Bridge
                NDJSON
```

The fixture bridge runs a TCP server that TouchDesigner connects to. This allows:
- TouchDesigner to run on a separate machine if needed
- Reconnection without restarting the bridge
- Multiple TD instances (future, for redundancy)

---

## 3. NDJSON Frame Format

Both renderers output identical frame format:

```json
{
  "version": 2,
  "frame": 12345,
  "ts": 1706400000,
  "fps": 60,
  "fixtures": {
    "left-wall-strip-1": {
      "type": "rgb_pixels",
      "led_count": 124,
      "rgb_b64": "base64encodedRGBdata..."
    },
    "hanging-loop-1": {
      "type": "rgb_pixels",
      "led_count": 200,
      "rgb_b64": "base64encodedRGBdata..."
    },
    "spot-1": {
      "type": "color",
      "rgb": [255, 128, 64],
      "brightness": 0.8
    }
  }
}
```

**Fields:**
- `version`: Protocol version (2)
- `frame`: Monotonically increasing frame number
- `ts`: Unix timestamp (seconds)
- `fps`: Current frame rate
- `fixtures`: Map of fixture ID → color data

**Fixture data types:**
- `rgb_pixels`: LED strip with base64-encoded RGB bytes
- `color`: Single color for spotlights/simple fixtures

---

## 4. Fixture Bridge Integration

### 4.1 Renderer Manager

The fixture bridge spawns or connects to the appropriate renderer:

```javascript
// packages/fixture-bridge/src/renderers/index.mjs
import { NodeRenderer } from './node-renderer.mjs';
import { TDRenderer } from './td-renderer.mjs';

export function createRenderer(type, options) {
  switch (type) {
    case 'node':
      return new NodeRenderer(options);
    case 'touchdesigner':
    case 'td':
      return new TDRenderer(options);
    default:
      throw new Error(`Unknown renderer type: ${type}`);
  }
}
```

### 4.2 Node.js Renderer Wrapper

Spawns the existing renderer as a child process:

```javascript
// packages/fixture-bridge/src/renderers/node-renderer.mjs
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import readline from 'readline';

export class NodeRenderer extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.process = null;
  }

  async start() {
    const rendererPath = this.options.rendererPath || '../renderer';

    this.process = spawn('node', [
      `${rendererPath}/src/main.mjs`,
      '--config', this.options.configPath
    ], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    const rl = readline.createInterface({ input: this.process.stdout });
    rl.on('line', (line) => {
      try {
        const frame = JSON.parse(line);
        this.emit('frame', frame);
      } catch (e) {
        // Ignore non-JSON lines
      }
    });

    this.process.on('exit', (code) => {
      this.emit('exit', code);
    });
  }

  async stop() {
    this.process?.kill('SIGTERM');
  }
}
```

### 4.3 TouchDesigner Renderer Connection

TCP server that TouchDesigner connects to:

```javascript
// packages/fixture-bridge/src/renderers/td-renderer.mjs
import net from 'net';
import { EventEmitter } from 'events';
import readline from 'readline';

export class TDRenderer extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.server = null;
    this.client = null;
  }

  async start() {
    const port = this.options.port || 49900;

    this.server = net.createServer((socket) => {
      console.log('TouchDesigner connected');
      this.client = socket;

      const rl = readline.createInterface({ input: socket });
      rl.on('line', (line) => {
        try {
          const frame = JSON.parse(line);
          this.emit('frame', frame);
        } catch (e) {
          // Ignore malformed lines
        }
      });

      socket.on('close', () => {
        console.log('TouchDesigner disconnected');
        this.client = null;
        this.emit('disconnect');
      });

      socket.on('error', (err) => {
        console.error('TouchDesigner connection error:', err.message);
      });

      this.emit('connect');
    });

    await new Promise((resolve) => {
      this.server.listen(port, () => {
        console.log(`Waiting for TouchDesigner on port ${port}`);
        resolve();
      });
    });
  }

  async stop() {
    this.client?.destroy();
    this.server?.close();
  }
}
```

---

## 5. CLI Interface

### 5.1 Launch Commands

```bash
# Start with Node.js renderer (default)
npm run bridge -- --config ./config/studio.json

# Start with Node.js renderer (explicit)
npm run bridge -- --config ./config/studio.json --renderer node

# Start with TouchDesigner renderer (waits for TD to connect)
npm run bridge -- --config ./config/studio.json --renderer td

# TouchDesigner with custom port
npm run bridge -- --config ./config/studio.json --renderer td --td-port 49900

# Dry run (validate config, don't start)
npm run bridge -- --config ./config/studio.json --dry-run
```

### 5.2 CLI Implementation

```javascript
// packages/fixture-bridge/src/cli.mjs
import { FixtureBridge } from './core/bridge.mjs';

function parseArgs(argv) {
  const result = {
    renderer: 'node',
    tdPort: 49900,
    dryRun: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' && argv[i + 1]) {
      result.config = argv[++i];
    } else if (arg === '--renderer' && argv[i + 1]) {
      result.renderer = argv[++i];
    } else if (arg === '--td-port' && argv[i + 1]) {
      result.tdPort = parseInt(argv[++i], 10);
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    }
  }

  return result;
}

export async function main(argv = process.argv) {
  const options = parseArgs(argv.slice(2));

  if (!options.config) {
    console.error('Error: --config <path> is required');
    process.exit(1);
  }

  const bridge = new FixtureBridge({
    renderer: options.renderer,
    rendererPort: options.tdPort
  });

  try {
    await bridge.initialize(options.config);

    if (options.dryRun) {
      console.log('Configuration valid');
      console.log(`Fixtures: ${bridge.config.fixtures.length}`);
      console.log(`Renderer: ${options.renderer}`);
      process.exit(0);
    }

    await bridge.start();

    const shutdown = async () => {
      await bridge.stop();
      process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
```

---

## 6. TouchDesigner Project Structure

### 6.1 Package Layout

```
packages/td-renderer/
├── project/
│   ├── led-lights.toe           # Main TouchDesigner project
│   └── led-lights.tox           # Reusable component (optional)
├── scripts/
│   ├── config_loader.py         # Loads v2 config JSON
│   ├── frame_output.py          # NDJSON output over TCP
│   └── fixture_mapper.py        # Maps effects to fixtures
├── examples/
│   ├── gradient.toe             # Example: simple gradient effect
│   └── volumetric.toe           # Example: 3D volumetric effect
└── README.md
```

### 6.2 TouchDesigner Network Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TouchDesigner Project                                 │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     CONFIG LOADER (DAT)                              │  │
│   │   • Reads v2 JSON config file                                        │  │
│   │   • Parses fixtures and geometry                                     │  │
│   │   • Creates Table DAT with fixture metadata                          │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     FIXTURE GEOMETRY (SOP/POP)                       │  │
│   │   • Generates point clouds for each LED strip                        │  │
│   │   • Uses geometry definitions from config                            │  │
│   │   • Paths interpolated via Script SOP or native curves               │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     EFFECTS (TOP/CHOP/SOP)                           │  │
│   │   • Visual effect generation                                         │  │
│   │   • Can be 2D (TOP) or 3D (SOP with color attributes)               │  │
│   │   • Multiple effects can be blended/switched                         │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     COLOR SAMPLER (TOP/CHOP)                         │  │
│   │   • Samples effect colors at fixture positions                       │  │
│   │   • TOP Lookup or Point SOP color transfer                          │  │
│   │   • Outputs CHOP with RGB values per LED                            │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     FRAME OUTPUT (Python DAT)                        │  │
│   │   • Collects colors from all fixtures                                │  │
│   │   • Formats as NDJSON                                                │  │
│   │   • Sends over TCP to fixture bridge                                 │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Config Loader Script

```python
# scripts/config_loader.py
import json

def load_config(config_path):
    """Load v2 config and return fixture data for TouchDesigner."""
    with open(config_path, 'r') as f:
        config = json.load(f)

    if config.get('version') != 2:
        raise ValueError('Config must be version 2')

    fixtures = []
    for fixture in config['fixtures']:
        fixtures.append({
            'id': fixture['id'],
            'type': fixture['type'],
            'geometry': fixture['geometry'],
            'led_count': get_led_count(fixture),
            'positions': compute_positions(fixture['geometry'])
        })

    return {
        'name': config.get('name', 'unnamed'),
        'space': config['space'],
        'fixtures': fixtures
    }

def get_led_count(fixture):
    """Extract LED count from fixture geometry."""
    geo = fixture['geometry']
    if geo['type'] == 'point':
        return 1
    elif geo['type'] == 'explicit':
        return len(geo['positions'])
    else:
        return geo.get('led_count', 0)

def compute_positions(geometry):
    """Compute 3D positions for fixture LEDs."""
    geo_type = geometry['type']

    if geo_type == 'point':
        return [geometry['position']]

    elif geo_type == 'explicit':
        return geometry['positions']

    elif geo_type == 'line':
        start = geometry['start']
        end = geometry['end']
        count = geometry['led_count']
        positions = []
        for i in range(count):
            t = i / (count - 1) if count > 1 else 0
            positions.append([
                start[0] + (end[0] - start[0]) * t,
                start[1] + (end[1] - start[1]) * t,
                start[2] + (end[2] - start[2]) * t
            ])
        return positions

    elif geo_type == 'path':
        # Use catmull-rom interpolation
        return interpolate_path(
            geometry['control_points'],
            geometry['led_count'],
            geometry.get('interpolation', 'catmull-rom'),
            geometry.get('closed', False)
        )

    return []

def interpolate_path(control_points, led_count, interpolation, closed):
    """Interpolate path to get LED positions."""
    # Implementation of catmull-rom etc.
    # ... (similar to JavaScript version)
    pass
```

### 6.4 Frame Output Script

```python
# scripts/frame_output.py
import json
import socket
import base64

class FrameOutput:
    def __init__(self, host='127.0.0.1', port=49900):
        self.host = host
        self.port = port
        self.socket = None
        self.frame_num = 0

    def connect(self):
        """Connect to fixture bridge."""
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.connect((self.host, self.port))
        print(f'Connected to fixture bridge at {self.host}:{self.port}')

    def disconnect(self):
        """Disconnect from fixture bridge."""
        if self.socket:
            self.socket.close()
            self.socket = None

    def send_frame(self, fixtures_data):
        """
        Send frame to fixture bridge.

        fixtures_data: dict mapping fixture_id to color data
          For LED strips: list of (r, g, b) tuples (0-255)
          For spots: single (r, g, b, brightness) tuple
        """
        if not self.socket:
            return

        frame = {
            'version': 2,
            'frame': self.frame_num,
            'ts': int(absTime.seconds),
            'fps': project.cookRate,
            'fixtures': {}
        }

        for fixture_id, data in fixtures_data.items():
            if isinstance(data, list):
                # LED strip - list of RGB tuples
                rgb_bytes = bytearray()
                for r, g, b in data:
                    rgb_bytes.extend([
                        int(max(0, min(255, r))),
                        int(max(0, min(255, g))),
                        int(max(0, min(255, b)))
                    ])
                frame['fixtures'][fixture_id] = {
                    'type': 'rgb_pixels',
                    'led_count': len(data),
                    'rgb_b64': base64.b64encode(bytes(rgb_bytes)).decode('ascii')
                }
            else:
                # Single color fixture
                r, g, b, brightness = data
                frame['fixtures'][fixture_id] = {
                    'type': 'color',
                    'rgb': [int(r), int(g), int(b)],
                    'brightness': float(brightness)
                }

        line = json.dumps(frame) + '\n'
        self.socket.sendall(line.encode('utf-8'))
        self.frame_num += 1


# Global instance for TouchDesigner
output = FrameOutput()

def onStart():
    """Called when project starts."""
    output.connect()

def onEnd():
    """Called when project stops."""
    output.disconnect()

def onFrame(fixtures_data):
    """Called each frame to send data."""
    output.send_frame(fixtures_data)
```

---

## 7. TouchDesigner Workflow

### 7.1 Setup Steps

1. **Install TouchDesigner** (free non-commercial or licensed)

2. **Open the project**: `packages/td-renderer/project/led-lights.toe`

3. **Configure config path**: Set the path to your v2 config JSON in the Config Loader DAT

4. **Start the fixture bridge** with TD renderer:
   ```bash
   npm run bridge -- --config ./config/studio.json --renderer td
   ```

5. **Press Play in TouchDesigner**: It connects to the bridge and starts sending frames

### 7.2 Creating Effects

Effects in TouchDesigner can be:

**2D Effects (TOP-based)**:
- Create visual in TOPs (Noise, Ramp, Movie, etc.)
- Sample using TOP to CHOP at fixture XY positions
- Good for wall-based installations

**3D Effects (SOP/POP-based)**:
- Create geometry with color attributes
- Use Point Transfer or similar to assign colors
- Good for volumetric installations

**Hybrid**:
- Combine 2D textures with 3D positioning
- Use Lookup TOP with 3D-projected UVs

### 7.3 Parameter Control

TouchDesigner can expose parameters via:

- **OSC**: Receive control from external apps
- **MIDI**: Hardware controllers
- **UI**: Custom control panel in TD
- **Network**: WebSocket or HTTP

---

## 8. Licensing

### 8.1 TouchDesigner Licenses

| License | Cost | Resolution | Commercial |
|---------|------|------------|------------|
| **Non-Commercial** | Free | 1280×1280 | No |
| **Commercial** | $600 | Unlimited | Yes |
| **Pro** | $2200 | Unlimited | Yes + features |

### 8.2 TouchPlayer (Deployment)

For permanent installations without editing:

| License | Cost | Notes |
|---------|------|-------|
| **Non-Commercial** | Free | Personal use |
| **Commercial** | $300 | Paying installations |
| **Pro** | $800 | File protection |

### 8.3 Recommendation

- **Development**: Free Non-Commercial license is sufficient
- **Deployment**: $300 TouchPlayer Commercial for permanent installation
- **Total cost**: $300-$600 depending on needs

---

## 9. Implementation Phases

### Phase 1: Bridge Infrastructure (1 week)
- [ ] Create fixture bridge package structure
- [ ] Implement renderer manager with Node.js and TD options
- [ ] Add TCP server for TouchDesigner connection
- [ ] Test with mock NDJSON input

### Phase 2: TouchDesigner Project (1-2 weeks)
- [ ] Create base TouchDesigner project
- [ ] Implement config loader (Python)
- [ ] Build fixture geometry generator
- [ ] Create frame output component
- [ ] Test with simple gradient effect

### Phase 3: Effect Templates (1 week)
- [ ] Create example 2D effect (gradient, noise)
- [ ] Create example 3D effect (volumetric)
- [ ] Document effect creation workflow
- [ ] Create parameter control examples

### Phase 4: Integration Testing (1 week)
- [ ] Test full pipeline: TD → Bridge → Fixtures
- [ ] Compare output with Node.js renderer
- [ ] Measure latency and performance
- [ ] Document troubleshooting

---

## 10. Open Questions

1. **Latency**: What's the acceptable latency for the TCP connection? (Likely <10ms on local network)

2. **Reconnection**: Should the bridge buffer frames if TD disconnects briefly?

3. **Parameter sync**: Should parameters be synced from Node.js config to TD, or are they independent?

4. **Multiple instances**: Support for multiple TD instances for redundancy?

5. **Remote TD**: Support for TouchDesigner on a different machine? (Should work with TCP, may need configuration)

---

## 11. Appendix: TouchDesigner Resources

### 11.1 Learning Resources

- [TouchDesigner Wiki](https://docs.derivative.ca/)
- [The Interactive & Immersive HQ](https://interactiveimmersive.io/)
- [Matthew Ragan's Teaching Resources](https://matthewragan.com/teaching-resources/)

### 11.2 Relevant Tutorials

- [DMX, ArtNet and LED Mapping](https://derivative.ca/community-post/tutorial/pixel-mapping-dmx-leds-and-lights-using-touchdesigner/69617)
- [Point Operators (POPs) for LED Mapping](https://docs.derivative.ca/DMX_Fixture_POP)
- [TCP/IP in TouchDesigner](https://docs.derivative.ca/TCP/IP_DAT)

### 11.3 Useful Operators

| Operator | Purpose |
|----------|---------|
| **Table DAT** | Store fixture metadata |
| **Script SOP** | Generate fixture geometry from config |
| **Point SOP** | Create LED point clouds |
| **Noise TOP** | Procedural effects |
| **Lookup CHOP** | Sample colors at positions |
| **TCP/IP DAT** | Network output |
