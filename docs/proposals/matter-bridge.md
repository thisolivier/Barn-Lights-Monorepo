# Planning Document: Matter Bridge for Bluetooth Spotlights

**Version:** 1.0
**Date:** 2026-01-27
**Status:** Draft
**Depends on:** None (independent feature)

---

## 1. Overview

### 1.1 Purpose

Create a Raspberry Pi-based bridge that:
1. Connects to Bluetooth spotlights via BLE
2. Exposes them as Matter-compatible devices (for HomeKit/Google Home/Alexa)
3. Provides a local HTTP API for the LED control service
4. Maintains an inventory mapping physical locations to devices

### 1.2 Goals

- Community members can control spotlights from their preferred smart home app
- Each person can save their own scenes and automations
- LED control service can coordinate spotlight colors with main LED installation
- Single source of truth for light inventory and locations

### 1.3 Non-Goals (for initial version)

- Complex automation logic (leave that to HomeKit/Google Home)
- Audio reactivity (handle in main LED service)
- Support for non-BLE fixtures (future enhancement)

---

## 2. Light Identification

### 2.1 BLE Identification

Each Bluetooth device has several identifiers:

| Identifier | Description | Persistence | Example |
|------------|-------------|-------------|---------|
| **MAC Address** | Hardware address | Permanent | `AA:BB:CC:DD:EE:01` |
| **Local Name** | Advertised name | Can change | `Triones-AABBCCDD` |
| **Service UUIDs** | Capabilities advertised | Fixed per model | `0000fff0-0000-1000-8000-00805f9b34fb` |

**MAC Address** is the primary identifier:
- Unique to each physical device
- Doesn't change (unless device is factory reset on some models)
- Used to reconnect to the same light reliably

**Discovery process:**
```
1. Bridge scans for BLE advertisements
2. Filters by known service UUIDs (light protocol signatures)
3. Records MAC address + local name for each discovered device
4. User assigns friendly names and locations in inventory
```

### 2.2 Matter Identification

Once exposed via Matter, each light gets additional identifiers:

| Identifier | Description | Assigned By |
|------------|-------------|-------------|
| **Node ID** | Unique ID on Matter fabric | Matter fabric |
| **Endpoint ID** | Sub-device within a node | Bridge (we control this) |
| **Vendor/Product ID** | Device type identifiers | Bridge configuration |

**Our bridge is a single Matter node** with multiple endpoints:
```
Matter Node (Bridge)
├── Endpoint 0: Root (required by Matter)
├── Endpoint 1: Aggregator (bridge device type)
├── Endpoint 2: Light "spot-1" ──▶ BLE AA:BB:CC:DD:EE:01
├── Endpoint 3: Light "spot-2" ──▶ BLE AA:BB:CC:DD:EE:02
└── Endpoint 4: Light "spot-3" ──▶ BLE AA:BB:CC:DD:EE:03
```

**Endpoint IDs are stable** - we assign them based on inventory order, so HomeKit/Google Home automations don't break when bridge restarts.

### 2.3 Identification Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DISCOVERY PHASE                                  │
│                                                                         │
│   BLE Scan ──▶ Found: AA:BB:CC:DD:EE:01 "Living Room Light"            │
│             ──▶ Found: AA:BB:CC:DD:EE:02 "Bedroom Light"               │
│                                                                         │
│   User adds to inventory.json with locations                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        RUNTIME MAPPING                                  │
│                                                                         │
│   inventory.json                                                        │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ {                                                                │  │
│   │   "spot-living": {                                               │  │
│   │     "mac": "AA:BB:CC:DD:EE:01",                                  │  │
│   │     "endpoint_id": 2,                                            │  │
│   │     "position": [2.0, 2.8, 1.0]                                  │  │
│   │   }                                                              │  │
│   │ }                                                                │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   HomeKit/Google ◀──Matter──▶ Endpoint 2 ◀──Bridge──▶ BLE MAC         │
│   LED Service    ◀──HTTP───▶ "spot-living" ◀──Bridge──▶ BLE MAC       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Inventory Management

### 3.1 Inventory File Format

The bridge maintains a JSON inventory file that serves as the source of truth:

```json
{
  "version": 1,
  "lights": {
    "spot-living-1": {
      "mac_address": "AA:BB:CC:DD:EE:01",
      "display_name": "Living Room Spot 1",
      "endpoint_id": 2,
      "position": [2.0, 2.8, 1.0],
      "aim": [2.0, 0.0, 4.0],
      "protocol": {
        "type": "triones",
        "service_uuid": "0000fff0-0000-1000-8000-00805f9b34fb",
        "write_characteristic": "0000fff3-0000-1000-8000-00805f9b34fb"
      },
      "capabilities": {
        "color": true,
        "white": true,
        "brightness": true,
        "color_temp": false
      },
      "group": "ambient-spots",
      "enabled": true
    },
    "spot-living-2": {
      "mac_address": "AA:BB:CC:DD:EE:02",
      "display_name": "Living Room Spot 2",
      "endpoint_id": 3,
      "position": [8.0, 2.8, 1.0],
      "aim": [8.0, 0.0, 4.0],
      "protocol": {
        "type": "triones"
      },
      "capabilities": {
        "color": true,
        "white": true,
        "brightness": true
      },
      "group": "ambient-spots",
      "enabled": true
    }
  },
  "protocols": {
    "triones": {
      "service_uuid": "0000fff0-0000-1000-8000-00805f9b34fb",
      "write_characteristic": "0000fff3-0000-1000-8000-00805f9b34fb",
      "commands": {
        "set_rgb": "56{r}{g}{b}00f0aa",
        "set_white": "56000000{w}0faa",
        "power_on": "cc2333",
        "power_off": "cc2433"
      }
    }
  },
  "groups": {
    "ambient-spots": {
      "display_name": "Ambient Spotlights",
      "members": ["spot-living-1", "spot-living-2"]
    }
  }
}
```

### 3.2 Key Fields Explained

**Identity fields:**
- `mac_address`: BLE hardware address (primary key for reconnection)
- `display_name`: Human-readable name (shown in HomeKit/Google Home)
- `endpoint_id`: Matter endpoint (stable across restarts)

**Spatial fields (for LED service integration):**
- `position`: [x, y, z] coordinates in the same space as LED layout
- `aim`: Direction the spot points (for future beam simulation)
- `group`: Logical grouping for coordinated control

**Protocol fields:**
- `type`: Protocol handler to use (e.g., "triones", "magic_blue", "custom")
- `service_uuid`: BLE service to connect to
- `write_characteristic`: BLE characteristic for commands
- `commands`: Protocol-specific command templates

**Capability fields:**
- `color`: Supports RGB control
- `white`: Has dedicated white channel
- `brightness`: Supports dimming
- `color_temp`: Supports warm/cool white adjustment

### 3.3 Discovery Mode

The bridge includes a discovery mode for finding new lights:

```bash
# Run discovery scan
curl http://bridge.local:8080/api/discover

# Response:
{
  "discovered": [
    {
      "mac_address": "AA:BB:CC:DD:EE:03",
      "local_name": "Triones-EEFF0011",
      "rssi": -45,
      "service_uuids": ["0000fff0-0000-1000-8000-00805f9b34fb"],
      "detected_protocol": "triones",
      "in_inventory": false
    }
  ]
}

# Add to inventory
curl -X POST http://bridge.local:8080/api/lights \
  -H "Content-Type: application/json" \
  -d '{
    "id": "spot-bedroom",
    "mac_address": "AA:BB:CC:DD:EE:03",
    "display_name": "Bedroom Spot",
    "position": [5.0, 2.5, 3.0],
    "group": "bedroom"
  }'
```

### 3.4 LED Service Integration Method: Reference by ID

The LED service references bridge lights by their ID in the main layout configuration. This is the **recommended and only supported method**.

**Why this approach:**
- **Single source of truth**: Spatial layout lives in one place (main config)
- **Separation of concerns**: Bridge handles BLE/Matter details; LED service handles spatial effects
- **Simple integration**: LED service doesn't need to understand BLE or inventory management
- **Consistent with other fixtures**: Same config pattern as LED strips

**Configuration structure:**

```json
// Main layout config (used by LED service)
// File: config/studio.json
{
  "version": 2,
  "fixtures": [
    {
      "id": "spot-living-1",
      "type": "bridge_spot",
      "output": {
        "protocol": "http",
        "bridge_url": "http://bridge.local:8080",
        "light_id": "spot-living-1"
      },
      "geometry": {
        "type": "point",
        "position": [2.0, 2.8, 1.0],
        "aim": [2.0, 0.0, 4.0]
      }
    },
    {
      "id": "spot-living-2",
      "type": "bridge_spot",
      "output": {
        "protocol": "http",
        "bridge_url": "http://bridge.local:8080",
        "light_id": "spot-living-2"
      },
      "geometry": {
        "type": "point",
        "position": [8.0, 2.8, 1.0],
        "aim": [8.0, 0.0, 4.0]
      }
    }
  ]
}
```

**Key points:**
- `light_id` in the config must match an ID in the bridge's inventory
- Position/aim data lives in the main config (LED service's domain)
- Bridge only needs to know MAC address and BLE protocol (its domain)
- The `bridge_url` allows for multiple bridges if needed (e.g., different rooms)

---

## 4. Setting Up a New Light

This section describes the complete workflow for adding a new Bluetooth spotlight to the system.

### 4.1 Setup Workflow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 1: Physical Installation                                              │
│  Install the light, power it on, note its approximate position              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 2: Discover via Bridge                                                │
│  POST http://bridge.local:8080/api/discover                                 │
│  Bridge scans BLE, returns list of found lights with MAC addresses          │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 3: Add to Bridge Inventory                                            │
│  POST http://bridge.local:8080/api/inventory                                │
│  Provide: id, mac_address, display_name, protocol (if known)                │
│  Bridge assigns Matter endpoint, begins maintaining BLE connection          │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 4: Test via Bridge API                                                │
│  PUT http://bridge.local:8080/api/lights/spot-new/rgb                       │
│  Verify light responds to color commands                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 5: Add to HomeKit/Google Home (optional)                              │
│  Use Home app to scan bridge QR code (first time only)                      │
│  New lights automatically appear as accessories                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 6: Add to LED Service Config                                          │
│  Edit config/studio.json, add fixture with matching light_id                │
│  Specify position in 3D space for effect coordination                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  STEP 7: Restart LED Service                                                │
│  Service loads new config, begins sending colors to new light               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Step-by-Step Commands

**Step 2: Discover new lights**
```bash
# Start a 10-second BLE scan
curl -X POST "http://bridge.local:8080/api/discover?duration=10"

# Response:
{
  "status": "scanning",
  "duration_seconds": 10
}

# Wait, then get results
curl http://bridge.local:8080/api/discover/results

# Response:
{
  "discovered": [
    {
      "mac_address": "AA:BB:CC:DD:EE:05",
      "local_name": "Triones-DDEEFF05",
      "rssi": -52,
      "service_uuids": ["0000fff0-0000-1000-8000-00805f9b34fb"],
      "detected_protocol": "triones",
      "in_inventory": false
    }
  ],
  "scan_completed_at": "2026-01-27T14:30:00Z"
}
```

**Step 3: Add to bridge inventory**
```bash
curl -X POST http://bridge.local:8080/api/inventory \
  -H "Content-Type: application/json" \
  -d '{
    "id": "spot-kitchen",
    "mac_address": "AA:BB:CC:DD:EE:05",
    "display_name": "Kitchen Spotlight",
    "protocol": "triones",
    "group": "kitchen"
  }'

# Response:
{
  "success": true,
  "light": {
    "id": "spot-kitchen",
    "mac_address": "AA:BB:CC:DD:EE:05",
    "display_name": "Kitchen Spotlight",
    "endpoint_id": 5,
    "protocol": "triones",
    "group": "kitchen",
    "enabled": true,
    "connected": false
  }
}
```

**Step 4: Test the light**
```bash
# Set to red
curl -X PUT http://bridge.local:8080/api/lights/spot-kitchen/rgb \
  -H "Content-Type: application/json" \
  -d '{"r": 255, "g": 0, "b": 0}'

# Set to white at 50% brightness
curl -X PUT http://bridge.local:8080/api/lights/spot-kitchen \
  -H "Content-Type: application/json" \
  -d '{
    "on": true,
    "brightness": 0.5,
    "color": {"rgb": [255, 255, 255]}
  }'
```

**Step 6: Add to LED service config**
```json
// Add to config/studio.json fixtures array:
{
  "id": "spot-kitchen",
  "type": "bridge_spot",
  "output": {
    "protocol": "http",
    "bridge_url": "http://bridge.local:8080",
    "light_id": "spot-kitchen"
  },
  "geometry": {
    "type": "point",
    "position": [5.0, 2.5, 6.0],
    "aim": [5.0, 0.0, 6.0]
  }
}
```

### 4.3 Inventory vs Config: What Goes Where

| Data | Location | Reason |
|------|----------|--------|
| MAC address | Bridge inventory | BLE detail, bridge's domain |
| BLE protocol | Bridge inventory | BLE detail, bridge's domain |
| Display name (for HomeKit) | Bridge inventory | Matter detail, bridge's domain |
| Matter endpoint ID | Bridge inventory | Auto-assigned by bridge |
| 3D position | LED service config | Spatial layout, LED service's domain |
| Aim direction | LED service config | Spatial layout, LED service's domain |
| Group membership | Both (optional) | Bridge groups for HomeKit; config groups for effects |

---

## 5. Architecture

### 4.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Raspberry Pi                                    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Matter Bridge Service                          │  │
│  │                      (Node.js + matter.js)                        │  │
│  │                                                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│  │  │  Inventory  │  │   Matter    │  │      HTTP API           │   │  │
│  │  │  Manager    │  │   Server    │  │                         │   │  │
│  │  │             │  │             │  │  GET  /api/lights       │   │  │
│  │  │ • Load/save │  │ • Endpoint  │  │  POST /api/lights/:id   │   │  │
│  │  │ • Validate  │  │   per light │  │  GET  /api/discover     │   │  │
│  │  │ • Discovery │  │ • Clusters  │  │  GET  /api/inventory    │   │  │
│  │  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘   │  │
│  │         │                │                     │                  │  │
│  │         └────────────────┼─────────────────────┘                  │  │
│  │                          │                                        │  │
│  │                   ┌──────┴──────┐                                 │  │
│  │                   │   Light     │                                 │  │
│  │                   │  Controller │                                 │  │
│  │                   │             │                                 │  │
│  │                   │ • State     │                                 │  │
│  │                   │ • Commands  │                                 │  │
│  │                   │ • Priority  │                                 │  │
│  │                   └──────┬──────┘                                 │  │
│  │                          │                                        │  │
│  │  ┌───────────────────────┴───────────────────────────────────┐   │  │
│  │  │                    BLE Manager                             │   │  │
│  │  │                    (Noble)                                 │   │  │
│  │  │                                                            │   │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │   │  │
│  │  │  │Connection│  │Connection│  │Connection│  │Connection│   │   │  │
│  │  │  │  spot-1  │  │  spot-2  │  │  spot-3  │  │   ...    │   │   │  │
│  │  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │   │  │
│  │  └────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                         │
         │ BLE               │ Matter                  │ HTTP
         ▼                    ▼                         ▼
   ┌───────────┐        ┌───────────┐           ┌───────────────┐
   │ Bluetooth │        │ HomeKit/  │           │  LED Control  │
   │ Spotlights│        │ Google/   │           │  Service      │
   │           │        │ Alexa     │           │               │
   └───────────┘        └───────────┘           └───────────────┘
```

### 4.2 Module Structure

```
matter-bridge/
├── src/
│   ├── index.ts                 # Entry point
│   ├── config.ts                # Configuration loading
│   │
│   ├── inventory/
│   │   ├── manager.ts           # Load/save/validate inventory
│   │   ├── discovery.ts         # BLE scanning for new lights
│   │   └── types.ts             # TypeScript interfaces
│   │
│   ├── ble/
│   │   ├── manager.ts           # Connection pool management
│   │   ├── connection.ts        # Individual light connection
│   │   └── protocols/
│   │       ├── base.ts          # Protocol interface
│   │       ├── triones.ts       # Triones/LED BLE protocol
│   │       ├── magic-blue.ts    # Magic Blue protocol
│   │       └── index.ts         # Protocol registry
│   │
│   ├── matter/
│   │   ├── bridge.ts            # Matter bridge device setup
│   │   ├── light-endpoint.ts    # Color light endpoint definition
│   │   └── clusters.ts          # On/Off, LevelControl, ColorControl
│   │
│   ├── controller/
│   │   ├── light-controller.ts  # Unified light control interface
│   │   ├── state.ts             # Light state management
│   │   └── priority.ts          # Command source priority
│   │
│   ├── http/
│   │   ├── server.ts            # Express/Fastify server
│   │   ├── routes/
│   │   │   ├── lights.ts        # Light control endpoints
│   │   │   ├── discovery.ts     # Discovery endpoints
│   │   │   └── inventory.ts     # Inventory management
│   │   └── middleware.ts        # Auth, logging, etc.
│   │
│   └── utils/
│       ├── color.ts             # Color space conversions
│       └── logger.ts            # Logging utility
│
├── data/
│   └── inventory.json           # Persistent inventory (git-ignored)
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## 6. HTTP API

### 5.1 Light Control

```
GET /api/lights
  Returns all lights with current state

GET /api/lights/:id
  Returns single light state

PUT /api/lights/:id
  Set light state
  Body: {
    "on": true,
    "brightness": 0.8,        # 0.0 - 1.0
    "color": {
      "rgb": [255, 128, 64]   # RGB 0-255
      # OR
      "hsv": [30, 1.0, 0.8]   # H: 0-360, S: 0-1, V: 0-1
    }
  }

PUT /api/lights/:id/rgb
  Shorthand for color-only update
  Body: { "r": 255, "g": 128, "b": 64 }

POST /api/lights/:id/scene
  Trigger a fade/transition
  Body: {
    "color": { "rgb": [255, 0, 0] },
    "duration_ms": 2000,
    "easing": "ease-in-out"
  }
```

### 5.2 Group Control

```
GET /api/groups
  Returns all groups

PUT /api/groups/:id
  Set all lights in group
  Body: { "on": true, "color": { "rgb": [255, 255, 255] } }
```

### 5.3 Discovery

```
POST /api/discover
  Start BLE scan for new lights
  Query: ?duration=10 (seconds)

GET /api/discover/results
  Get results of last scan

POST /api/inventory
  Add discovered light to inventory
  Body: {
    "id": "spot-new",
    "mac_address": "AA:BB:CC:DD:EE:04",
    "display_name": "New Spot",
    "position": [5.0, 2.0, 3.0]
  }

DELETE /api/inventory/:id
  Remove light from inventory
```

### 5.4 Inventory

```
GET /api/inventory
  Returns full inventory (for LED service to sync)

GET /api/inventory/export
  Export inventory as JSON file

POST /api/inventory/import
  Import inventory from JSON file
```

---

## 7. Matter Integration

### 6.1 Device Types

Using matter.js, the bridge exposes:

**Bridge device (Endpoint 0-1):**
- Device Type: `Aggregator` (0x000E)
- Allows grouping multiple lights under one Matter node

**Per-light endpoints (Endpoint 2+):**
- Device Type: `Extended Color Light` (0x010D)
- Clusters:
  - `OnOff` - Power control
  - `LevelControl` - Brightness
  - `ColorControl` - RGB/HSV color

### 6.2 matter.js Implementation Sketch

```typescript
// src/matter/bridge.ts
import {
  ServerNode,
  Endpoint,
  AggregatorEndpoint,
  ExtendedColorLightDevice
} from "@matter/main";

export class MatterBridge {
  private node: ServerNode;
  private lightEndpoints: Map<string, Endpoint> = new Map();

  async initialize(inventory: Inventory) {
    // Create the bridge node
    this.node = await ServerNode.create({
      id: "led-lights-bridge",
      network: { port: 5540 },
      commissioning: {
        passcode: 20242024,
        discriminator: 3840
      },
      productDescription: {
        name: "LED Lights Bridge",
        deviceType: AggregatorEndpoint.deviceType
      }
    });

    // Add root aggregator endpoint
    const aggregator = new Endpoint(AggregatorEndpoint, { id: "aggregator" });
    await this.node.add(aggregator);

    // Add endpoint for each light in inventory
    for (const [id, light] of Object.entries(inventory.lights)) {
      if (!light.enabled) continue;

      const endpoint = new Endpoint(ExtendedColorLightDevice, {
        id: `light-${id}`,
        endpointId: light.endpoint_id
      });

      // Bind cluster handlers
      endpoint.events.onOff.onOff$Changed.on((value) => {
        this.handlePowerChange(id, value);
      });

      endpoint.events.levelControl.currentLevel$Changed.on((value) => {
        this.handleBrightnessChange(id, value);
      });

      endpoint.events.colorControl.currentHue$Changed.on((hue) => {
        this.handleColorChange(id);
      });

      await aggregator.add(endpoint);
      this.lightEndpoints.set(id, endpoint);
    }

    await this.node.start();
  }

  // Called by LightController when state changes (from HTTP API or internal)
  async updateLightState(id: string, state: LightState) {
    const endpoint = this.lightEndpoints.get(id);
    if (!endpoint) return;

    // Update Matter clusters to reflect current state
    await endpoint.set({
      onOff: { onOff: state.on },
      levelControl: { currentLevel: Math.round(state.brightness * 254) },
      colorControl: {
        currentHue: Math.round(state.hue * 254 / 360),
        currentSaturation: Math.round(state.saturation * 254)
      }
    });
  }
}
```

### 6.3 Commissioning Flow

When users add the bridge to HomeKit/Google Home:

1. **QR Code / Setup Code**: Bridge displays commissioning code on startup
2. **User scans code** in Home app
3. **Matter commissioning**: Secure pairing establishes shared fabric credentials
4. **Lights appear**: Each light shows as separate accessory in the home

```
Bridge startup log:
---
Matter Bridge starting...
Commissioning code: 3484-076-2908
QR Code: MT:Y.K90KP500ABCD1234
---
```

---

## 8. BLE Protocol Handling

### 7.1 Protocol Abstraction

Different cheap BLE lights use different protocols. The bridge abstracts this:

```typescript
// src/ble/protocols/base.ts
export interface LightProtocol {
  readonly name: string;
  readonly serviceUuid: string;
  readonly writeCharacteristic: string;

  // Build command buffers
  buildPowerCommand(on: boolean): Buffer;
  buildColorCommand(r: number, g: number, b: number): Buffer;
  buildWhiteCommand(brightness: number): Buffer;

  // Parse state notifications (if supported)
  parseStateNotification?(data: Buffer): Partial<LightState>;
}
```

### 7.2 Example: Triones Protocol

Common in cheap "Magic Light" / "Happy Lighting" type bulbs:

```typescript
// src/ble/protocols/triones.ts
export class TrionesProtocol implements LightProtocol {
  readonly name = "triones";
  readonly serviceUuid = "0000fff0-0000-1000-8000-00805f9b34fb";
  readonly writeCharacteristic = "0000fff3-0000-1000-8000-00805f9b34fb";

  buildPowerCommand(on: boolean): Buffer {
    return Buffer.from(on ? [0xcc, 0x23, 0x33] : [0xcc, 0x24, 0x33]);
  }

  buildColorCommand(r: number, g: number, b: number): Buffer {
    // Format: 56 RR GG BB 00 f0 aa
    return Buffer.from([0x56, r, g, b, 0x00, 0xf0, 0xaa]);
  }

  buildWhiteCommand(brightness: number): Buffer {
    // Format: 56 00 00 00 WW 0f aa
    const w = Math.round(brightness * 255);
    return Buffer.from([0x56, 0x00, 0x00, 0x00, w, 0x0f, 0xaa]);
  }
}
```

### 7.3 Protocol Detection

During discovery, the bridge attempts to detect which protocol a light uses:

```typescript
// src/inventory/discovery.ts
async function detectProtocol(serviceUuids: string[]): string | null {
  const protocols = getRegisteredProtocols();

  for (const protocol of protocols) {
    if (serviceUuids.includes(protocol.serviceUuid)) {
      return protocol.name;
    }
  }

  return null; // Unknown protocol
}
```

---

## 9. Priority and Coordination

### 8.1 Command Sources

Multiple sources can control lights:

| Source | Priority | Use Case |
|--------|----------|----------|
| LED Service | High | Coordinated effects with main installation |
| HTTP API (direct) | High | Manual override, testing |
| Matter (HomeKit, etc.) | Normal | User control from phones |
| Scheduled scenes | Low | Ambient defaults |

### 8.2 Priority Logic

```typescript
// src/controller/priority.ts
export class PriorityController {
  private activeSource: CommandSource | null = null;
  private sourceTimeout: NodeJS.Timeout | null = null;

  // LED service takes priority and holds it for duration of effect
  acquirePriority(source: CommandSource, holdMs: number = 5000) {
    if (this.activeSource && this.activeSource.priority > source.priority) {
      return false; // Higher priority source is active
    }

    this.activeSource = source;
    this.clearTimeout();
    this.sourceTimeout = setTimeout(() => {
      this.releasePriority(source);
    }, holdMs);

    return true;
  }

  shouldAcceptCommand(source: CommandSource): boolean {
    if (!this.activeSource) return true;
    return source.priority >= this.activeSource.priority;
  }
}
```

### 8.3 State Synchronization

When a light changes (from any source), all interfaces are updated:

```typescript
// src/controller/light-controller.ts
async setLightState(id: string, state: Partial<LightState>, source: CommandSource) {
  if (!this.priority.shouldAcceptCommand(source)) {
    return; // Rejected due to priority
  }

  // Merge with current state
  const current = this.state.get(id);
  const newState = { ...current, ...state };

  // Send to BLE
  await this.ble.sendCommand(id, newState);

  // Update Matter clusters (so HomeKit shows correct state)
  await this.matter.updateLightState(id, newState);

  // Store state
  this.state.set(id, newState);

  // Emit event for any listeners
  this.emit('stateChanged', id, newState, source);
}
```

---

## 10. LED Service Integration

### 10.1 Fixture Configuration

In the main LED layout config, reference bridge lights by ID:

```json
{
  "version": 2,
  "fixtures": [
    {
      "id": "spot-living-1",
      "type": "bridge_spot",
      "output": {
        "protocol": "http",
        "bridge_url": "http://bridge.local:8080",
        "light_id": "spot-living-1"
      },
      "geometry": {
        "type": "point",
        "position": [2.0, 2.8, 1.0],
        "aim": [2.0, 0.0, 4.0]
      }
    }
  ]
}
```

### 10.2 HTTP Protocol: LED Service → Bridge

The LED service communicates with the bridge via a simple HTTP API. All endpoints accept and return JSON.

#### 10.2.1 Single Light Control

**Set light state (full control)**
```http
PUT /api/lights/:light_id
Content-Type: application/json

{
  "on": true,
  "brightness": 0.8,
  "color": {
    "rgb": [255, 128, 64]
  }
}
```

**Response:**
```json
{
  "success": true,
  "light_id": "spot-living-1",
  "state": {
    "on": true,
    "brightness": 0.8,
    "color": {
      "rgb": [255, 128, 64],
      "hsv": [20, 0.75, 1.0]
    }
  },
  "latency_ms": 35
}
```

**Set RGB color (shorthand)**
```http
PUT /api/lights/:light_id/rgb
Content-Type: application/json

{
  "r": 255,
  "g": 128,
  "b": 64
}
```

**Response:**
```json
{
  "success": true,
  "light_id": "spot-living-1",
  "color": {"r": 255, "g": 128, "b": 64}
}
```

#### 10.2.2 Batch Control (Multiple Lights)

For coordinated effects, the LED service can update multiple lights in a single request:

**Batch update**
```http
PUT /api/lights/batch
Content-Type: application/json

{
  "source": "led-service",
  "priority": "high",
  "lights": {
    "spot-living-1": {
      "on": true,
      "brightness": 0.8,
      "color": {"rgb": [255, 0, 0]}
    },
    "spot-living-2": {
      "on": true,
      "brightness": 0.8,
      "color": {"rgb": [0, 255, 0]}
    },
    "spot-kitchen": {
      "on": true,
      "brightness": 0.6,
      "color": {"rgb": [0, 0, 255]}
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "results": {
    "spot-living-1": {"success": true, "latency_ms": 32},
    "spot-living-2": {"success": true, "latency_ms": 28},
    "spot-kitchen": {"success": false, "error": "disconnected"}
  },
  "total_latency_ms": 45
}
```

#### 10.2.3 Group Control

**Set all lights in a group**
```http
PUT /api/groups/:group_id
Content-Type: application/json

{
  "on": true,
  "brightness": 0.7,
  "color": {"rgb": [255, 200, 150]}
}
```

#### 10.2.4 Priority Acquisition

The LED service should acquire priority before starting coordinated effects:

**Acquire priority**
```http
POST /api/priority/acquire
Content-Type: application/json

{
  "source": "led-service",
  "duration_ms": 30000,
  "priority": "high"
}
```

**Response:**
```json
{
  "success": true,
  "acquired": true,
  "expires_at": "2026-01-27T14:35:00Z",
  "source": "led-service"
}
```

**Release priority**
```http
POST /api/priority/release
Content-Type: application/json

{
  "source": "led-service"
}
```

#### 10.2.5 Health Check

**Get bridge status**
```http
GET /api/status
```

**Response:**
```json
{
  "status": "healthy",
  "uptime_seconds": 86400,
  "lights": {
    "total": 4,
    "connected": 3,
    "disconnected": 1
  },
  "matter": {
    "commissioned": true,
    "fabrics": 2
  },
  "priority": {
    "active_source": null,
    "expires_at": null
  }
}
```

### 10.3 Request/Response Schema

#### Light State Object

```typescript
interface LightState {
  on: boolean;
  brightness: number;      // 0.0 - 1.0
  color: {
    rgb?: [number, number, number];  // 0-255 each
    hsv?: [number, number, number];  // H: 0-360, S: 0-1, V: 0-1
  };
}
```

#### Batch Request Object

```typescript
interface BatchRequest {
  source: string;           // Identifier for the requesting service
  priority?: 'low' | 'normal' | 'high';
  hold_priority_ms?: number; // How long to hold priority after this request
  lights: {
    [light_id: string]: Partial<LightState>;
  };
}
```

### 10.4 Bridge Spot Adapter Implementation

In the fixture bridge (from main TouchDesigner proposal), add an adapter for bridge spots:

```typescript
// packages/fixture-bridge/src/adapters/bridge-spot-adapter.ts
import { BaseAdapter } from './base-adapter.mjs';

interface BridgeSpotConfig {
  bridge_url: string;
  light_id: string;
}

export class BridgeSpotAdapter extends BaseAdapter {
  private bridgeUrl: string;
  private lightId: string;
  private lastSend: number = 0;
  private minInterval: number = 50; // 20 Hz max (BLE limitation)
  private pendingState: LightState | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(fixture: Fixture) {
    super(fixture);
    const config = fixture.output as BridgeSpotConfig;
    this.bridgeUrl = config.bridge_url;
    this.lightId = config.light_id;
  }

  async connect(): Promise<void> {
    // Verify bridge is reachable
    const response = await fetch(`${this.bridgeUrl}/api/status`);
    if (!response.ok) {
      throw new Error(`Bridge not reachable at ${this.bridgeUrl}`);
    }
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.connected = false;
  }

  async send(colorData: ColorData): Promise<void> {
    if (!this.connected) return;

    const now = Date.now();
    const state: Partial<LightState> = {
      on: colorData.brightness > 0.01,
      brightness: colorData.brightness,
      color: { rgb: colorData.rgb }
    };

    // Rate limiting: BLE can't handle 60fps
    if (now - this.lastSend < this.minInterval) {
      this.pendingState = state;
      this.scheduleFlush();
      return;
    }

    await this.doSend(state);
    this.lastSend = now;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    const delay = this.minInterval - (Date.now() - this.lastSend);
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = null;
      if (this.pendingState) {
        const state = this.pendingState;
        this.pendingState = null;
        await this.doSend(state);
        this.lastSend = Date.now();
      }
    }, Math.max(0, delay));
  }

  private async doSend(state: Partial<LightState>): Promise<void> {
    try {
      const response = await fetch(
        `${this.bridgeUrl}/api/lights/${this.lightId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state)
        }
      );

      if (!response.ok) {
        console.error(`Bridge error for ${this.lightId}: ${response.status}`);
      }
    } catch (err) {
      console.error(`Bridge request failed for ${this.lightId}:`, err);
    }
  }
}
```

### 10.5 Batch Adapter for Multiple Spots

For better performance with multiple spots, use a batching adapter:

```typescript
// packages/fixture-bridge/src/adapters/bridge-batch-adapter.ts

/**
 * Collects updates for multiple bridge spots and sends them in batches.
 * More efficient than individual requests when coordinating many lights.
 */
export class BridgeBatchAdapter {
  private bridgeUrl: string;
  private pendingUpdates: Map<string, Partial<LightState>> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private flushInterval: number = 50; // 20 Hz

  constructor(bridgeUrl: string) {
    this.bridgeUrl = bridgeUrl;
  }

  queueUpdate(lightId: string, state: Partial<LightState>): void {
    this.pendingUpdates.set(lightId, state);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushInterval);
  }

  private async flush(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    const lights: Record<string, Partial<LightState>> = {};
    for (const [id, state] of this.pendingUpdates) {
      lights[id] = state;
    }
    this.pendingUpdates.clear();

    try {
      await fetch(`${this.bridgeUrl}/api/lights/batch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'led-service',
          priority: 'high',
          lights
        })
      });
    } catch (err) {
      console.error('Batch update failed:', err);
    }
  }
}
```

### 10.6 Timing Considerations

| Operation | Expected Latency | Notes |
|-----------|------------------|-------|
| HTTP request to bridge | 1-5ms | Local network |
| Bridge processing | <1ms | - |
| BLE GATT write | 15-50ms | Depends on connection interval |
| **Total round-trip** | **20-60ms** | - |

**Design implications:**
- Update spotlights at 10-20 Hz, not 60 Hz
- For strobing effects, accept that spots will lag ~50ms behind LED strips
- Use batch API when updating multiple spots simultaneously
- Acquire priority before starting coordinated effects

---

## 11. Hardware Requirements

### 10.1 Raspberry Pi Selection

| Model | Pros | Cons | Recommendation |
|-------|------|------|----------------|
| **Pi 4 (2GB+)** | Plenty of power, mature | Overkill, power hungry | Good choice |
| **Pi 5** | Fastest, latest | Expensive, may have BLE issues | If budget allows |
| **Pi Zero 2 W** | Cheap, low power | Limited RAM, slower | Works but tight |
| **Pi 3B+** | Cheap, proven | Older, slower | Budget option |

**Recommendation**: Raspberry Pi 4 (2GB) - good balance of capability and cost.

### 10.2 BLE Considerations

- Pi's built-in Bluetooth works for ~5-7 simultaneous connections
- For more lights, consider USB Bluetooth adapter with better antenna
- Some adapters support more concurrent connections

### 10.3 Network

- Wired Ethernet recommended for reliability
- Matter can work over WiFi but wired is more stable
- Static IP or mDNS (`bridge.local`) for service discovery

---

## 12. Implementation Phases

### Phase 1: BLE Foundation (1 week)
- [ ] Set up Pi with Node.js environment
- [ ] Implement BLE manager with Noble
- [ ] Reverse engineer target light protocol (or implement Triones as starting point)
- [ ] Basic inventory file loading
- [ ] Test: can control one light via command line

### Phase 2: HTTP API (1 week)
- [ ] Implement HTTP server (Fastify recommended)
- [ ] Light control endpoints
- [ ] Discovery endpoints
- [ ] Inventory management endpoints
- [ ] Test: control lights via curl

### Phase 3: Matter Integration (1-2 weeks)
- [ ] Set up matter.js
- [ ] Implement bridge device with aggregator
- [ ] Add light endpoints for each inventory item
- [ ] Handle Matter → BLE command flow
- [ ] Handle state sync (BLE changes reflected in Matter)
- [ ] Test: add to HomeKit, control from iPhone

### Phase 4: LED Service Integration (1 week)
- [ ] Document HTTP API
- [ ] Test integration with fixture bridge adapter
- [ ] Implement priority handling
- [ ] Tune rate limiting for smooth effects
- [ ] Test: coordinated effects across LEDs + spots

### Phase 5: Polish (1 week)
- [ ] Web UI for inventory management (optional)
- [ ] mDNS advertisement (`bridge.local`)
- [ ] Logging and diagnostics
- [ ] Systemd service for auto-start
- [ ] Documentation

---

## 13. Open Questions

1. **Light brand/model**: Need to identify to determine BLE protocol

2. **Number of spotlights**: Affects BLE connection limits

3. **Pi location**: Near lights (better BLE signal) or near router (better network)?

4. **Backup/recovery**: Should inventory be synced to main repo or kept local to Pi?

5. **Authentication**: Should HTTP API require auth, or rely on network isolation?

---

## 14. Appendix: Reverse Engineering BLE Protocol

If protocol documentation isn't available:

### A. Using nRF Connect (Android/iOS)

1. Install nRF Connect app
2. Scan and connect to light
3. Explore services and characteristics
4. Note UUIDs for the writable characteristic
5. Use the original app while monitoring with BLE sniffer

### B. Using Wireshark + Android

1. Enable Bluetooth HCI snoop log on Android
2. Use original app to control light
3. Pull log: `adb pull /sdcard/btsnoop_hci.log`
4. Open in Wireshark, filter by device MAC
5. Analyze GATT write commands

### C. Common Patterns

Most cheap RGB BLE lights use similar patterns:

```
Power on:   CC 23 33
Power off:  CC 24 33
Set RGB:    56 RR GG BB 00 F0 AA
Set White:  56 00 00 00 WW 0F AA
Set Scene:  BB [scene_id] 44
```

Services often use UUID base: `0000xxxx-0000-1000-8000-00805f9b34fb`
Common service: `fff0`, characteristics: `fff1` (notify), `fff3` (write)
