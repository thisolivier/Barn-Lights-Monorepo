# Teensy 4.1 LED Controller Firmware — Project Spec v2.0

## High level project goal
The goal is to display a lighting pattern on strings of individually addressable LED lights. The lighting patterns are emitted at a variable (but usually high approx 40fps) frame rate via UDP, and modelled according to the udp-data-format.md doc adjacent to this one. Robust performance, low latency, and recovery from failure is desired.

## More technical document purpose
This document defines the firmware for the Teensy 4.1 with native Ethernet, such that Human or LLM engineers can pick up the project and build it out. The device receives per-run UDP frames, drives WS2815 strips via OctoWS2811, and emits active heartbeats so the sender can track liveness/errors. Configuration is generated at build time from the JSON layouts; no runtime filesystem is used.

## 0. Scope & Goals

### In-scope (v2.0)
- Static IP Ethernet bring-up (Teensy 4.1 native Ethernet via QNEthernet library).
- UDP receiver on `PORT_BASE + run_index` for run 0..N (N ≤ 8).
- Frame assembly by `frame_id`; apply only last complete frame; otherwise hold last applied frame.
- WS281x (WS2815) output via OctoWS2811:
  - **Runs driven in parallel** using DMA—zero CPU overhead during transmission.
  - RGB→GRB conversion during buffer prep.
- Active heartbeat: compact JSON once per second (plus event pings on notable errors), unicast to the sender.
- Power-up behavior: hold black for ≥1 s or until first frame, whichever is later.
- Build-time codegen from layout JSON to set `RUN_COUNT` and `LED_COUNT[]`.
- PlatformIO-based build system with Python codegen script.

### Out-of-scope (v2.0)
- OTA/flash via Ethernet.
- Runtime configuration changes.
- HTTP, mDNS discovery, NTP.


## 1. Hardware Targets & GPIOs

### Teensy 4.1 Pin Assignments

**Ethernet:** Uses dedicated pins on the Teensy 4.1 (directly connected to the PHY). No conflicts with GPIO.

**OctoWS2811 Adapter CAT6 Wire Mapping:** The OctoWS2811 adapter uses a CAT6 cable (T568B wiring) to connect to LED strips:

| Output | Wire Color (T568B) | Twisted Pair |
|--------|-------------------|--------------|
| 0 | White-Orange | Orange pair |
| 1 | Orange | Orange pair |
| 2 | White-Green | Green pair |
| 3 | Blue | Blue pair |
| 4 | White-Blue | Blue pair |
| 5 | Green | Green pair |
| 6 | White-Brown | Brown pair |
| 7 | Brown | Brown pair |

**Onboard LED:** Pin 13 (directly usable for status indication).

**Note:** OctoWS2811 uses fixed Teensy pins internally (directly connected via the adapter board). If fewer than 8 runs are needed, unused outputs are simply left unconnected.



## 2. Packet & Heartbeat Protocols

### UDP run packet (sender → controller)
- **Dst IP:** controller's static IP (per side).
- **Dst Port:** `PORT_BASE + run_index`.
- **Payload:** See `udp-data-format.md` for full specification.
  - Offset 0: `u16 BE session_id` — identifies sender session
  - Offset 2: `u32 BE frame_id` — frame sequence number
  - Offset 6: `run_led_count × 3` RGB bytes (firmware converts to GRB)

**Apply rule:** only display when all runs for the same frame_id have arrived; otherwise hold last complete frame.

### Session ID handling
- `session_id` is generated randomly when the sender starts and remains constant for that session.
- When the firmware detects a **new session_id** (different from the last seen value):
  - Discard all incomplete frame assembly slots.
  - Reset `last_frame_id` to allow the new session's frames to be accepted.
  - Log the session change in the next heartbeat's error array.
- This ensures clean recovery when the sender restarts.

### Frame-ID ordering (wraparound)
- Frame IDs are 32-bit unsigned and compared **mod 2³²**.
- Define "newer(a,b)" as `(int32_t)(a - b) > 0`.
- A frame is considered stale if `!newer(frame_id, last_frame_id)`.
- This handles wraparound seamlessly.

### Heartbeat & events (controller → sender)
- **Mode:** active unicast to `SENDER_IP:STATUS_PORT`.  
- **Cadence:** 1 Hz heartbeat

**Heartbeat JSON example (≤256B):**
```json
{
  "id": "LEFT",
  "ip": "10.10.0.2",
  "uptime_ms": 123456,
  "link": true,
  "runs": 4,
  "leds": [400,400,400,400],
  "rx_frames": 59, // since the last heartbeat
  "complete": 55, // since the last heartbeat
  "applied": 54, // since the last heartbeat
  "dropped_frames": 2, // since the last heartbeat
  "errors": ["TIMESTAMP: error output"] // since last heartbeat. Each message truncated to 600 chars.
}
```

## 3. Build-Time Config

- Consume side layout JSON (e.g. `left.json`, `right.json`) at build time.  
- Generate header constants:
  - `SIDE_ID` (`LEFT`/`RIGHT`)  
  - `RUN_COUNT`  
  - `LED_COUNT[]`  
  - `EXPECTED_MASK` (bitmask of runs present)  
  - (Optional) `PORT_BASE`, `STATUS_PORT`, `STATIC_IP`, `SENDER_IP`  
- Tooling: `gen_config.py` → `config_autogen.h`.



## 4. Firmware Architecture

### Overview
The Teensy 4.1 runs a cooperative loop-based architecture (no RTOS required). The 600 MHz ARM Cortex-M7 provides ample performance for all tasks in a single-threaded model. OctoWS2811 handles LED output entirely via DMA, freeing the CPU for network processing.

### Main Loop Structure
```
setup():
  - Init OctoWS2811 (allocates DMA buffers, configures timers)
  - Init QNEthernet with static IP
  - Bind UDP sockets for each run port
  - Set all LEDs to black
  - Record startup time

loop():
  - net_poll(): Process incoming UDP packets
  - frame_check(): If complete frame ready, push to OctoWS2811
  - status_poll(): Send heartbeat if 1s elapsed
  - led_status_poll(): Update onboard LED state
```

### Components / Modules

- **net (network.cpp)**
  - Initialize QNEthernet with static IP.
  - Bind UDP sockets on `PORT_BASE + run_index` for each run.
  - `net_poll()`: Non-blocking check for incoming packets on all sockets.

- **rx (receiver.cpp)**
  - Process incoming UDP packets.
  - Deduce run_index from destination port.
  - Validate length = `6 + LED_COUNT[i]*3` (header + RGB data).
  - Track `session_id`; on change, reset frame assembly state and `last_frame_id`.
  - Stage into assembler slots keyed by `frame_id`.
  - Keep at most 2 frame_ids in flight (current/next).
  - On full mask match, mark frame complete.

- **driver (led_driver.cpp)**
  - On complete frame: convert RGB→GRB, copy to OctoWS2811 buffer, call `show()`.
  - OctoWS2811 transmits all strips in parallel via DMA—no CPU blocking.
  - Power-up: enforce ≥1 s black or until first complete frame.

- **status (status.cpp)**
  - Every 1000 ms: build and send heartbeat JSON via UDP.
  - Track counters: rx_frames, complete, applied, dropped.

- **led_status (led_status.cpp)**
  - Blink onboard LED (pin 13) slow until first frame received.
  - Quick tick every 60th frame for first 600 frames to indicate activity.



## 5. Timing & Buffering

### WS2815 Timing
- WS2815 @800 kHz: ~30 µs/LED including reset.
- 400-LED run: ~12.3 ms transmission time.
- 500-LED run: ~15.3 ms transmission time.

### OctoWS2811 Parallel Output
OctoWS2811 transmits **all 8 outputs simultaneously** using DMA:
- All runs complete in time of longest run (~15.3 ms for 500 LEDs).
- DMA transfer is non-blocking—CPU is free during transmission.
- Theoretical max: ~65 FPS even with 500-LED strips.
- Practical limit: network throughput and frame assembly, not LED output.

### Double Buffering
- OctoWS2811 uses double buffering internally.
- Safe to prepare next frame while current frame transmits.
- `show()` returns immediately; `busy()` can check if DMA complete.  



## 6. Error Handling & Recovery

- **Length mismatch:** drop packet; increment `drops_len`.
- **Stale frame:** if not newer than `last_frame_id`, ignore; increment `drops_stale`.
- **Out-of-order:** if a newer frame completes first, apply it and discard older incomplete.
- **No packets:** keep last complete frame indefinitely.
- **Session change:** when `session_id` differs from last seen, discard incomplete frames, reset `last_frame_id`, log event. This allows immediate acceptance of the new sender's frames.
- **Link-down:** retain last applied frame, discard incomplete assembly slots. Resume fresh on link-up.



## 7. Build, Flash, Tooling

### Requirements
- PlatformIO Core (CLI) or PlatformIO IDE extension.
- Python 3.11+ (for codegen script).
- Teensy 4.1 connected via USB.

### Libraries (managed via platformio.ini)
- **OctoWS2811**: Parallel LED output via DMA.
- **QNEthernet**: Native Ethernet stack for Teensy 4.1.

### Build Process
```bash
# Generate config header from layout JSON
python scripts/gen_config.py config/device.json > src/config_autogen.h

# Build firmware
pio run

# Build and upload
pio run --target upload

# Monitor serial output
pio device monitor
```

### platformio.ini
```ini
[env:teensy41]
platform = teensy
board = teensy41
framework = arduino
lib_deps =
    OctoWS2811
    QNEthernet
build_flags =
    -D TEENSY41
    -O2
```  



## 8. Test Plan

1. **Boot sequence:** Power on → all LEDs black for ≥1 s, onboard LED (pin 13) blinks slowly.
2. **Ethernet up:** Static IP reachable via ping.
3. **Single frame:** Send valid run packets for all runs with same frame_id → strips update together.
4. **Partial frame:** Send incomplete frame (missing one run) → no update, holds previous.
5. **Sustained traffic:** Full sender @30–60 FPS → confirm smooth updates, no flicker.
6. **Packet loss:** Drop runs randomly → controller holds last complete frame.
7. **Heartbeat:** Verify JSON heartbeat received at sender every ~1 s.
8. **Counters:** `rx_frames`, `complete`, `applied`, `dropped_frames` match expected behavior.
9. **Link loss/restore:** Unplug Ethernet → holds last frame. Replug → resumes cleanly.



## 9. Configuration Matrix

| Setting       | Source             | Example              | Notes |
|---------------|-------------------|----------------------|-------|
| SIDE_ID       | device.json        | "LEFT"               | Identifier in heartbeat |
| STATIC_IP     | device.json        | "10.10.0.2"          | |
| GATEWAY_IP    | device.json        | "10.10.0.1"          | Usually same as sender |
| SUBNET_MASK   | device.json        | "255.255.255.0"      | |
| PORT_BASE     | device.json        | 49600                | |
| STATUS_PORT   | device.json        | 49700                | |
| SENDER_IP     | device.json        | "10.10.0.1"          | Heartbeat destination |
| RUN_COUNT     | generated          | 4                    | Max 8 for OctoWS2811 |
| LED_COUNT[]   | generated          | [400,400,400,400]    | Per-run LED counts |
| MAX_LEDS      | generated          | 500                  | Longest run (for buffer sizing) |

**Note:** GPIO pins are fixed by OctoWS2811 hardware requirements and not configurable.



## 10. References

- [Teensy 4.1 Product Page](https://www.pjrc.com/store/teensy41.html) — pinouts, specs.
- [OctoWS2811 Library](https://www.pjrc.com/teensy/td_libs_OctoWS2811.html) — parallel LED output documentation.
- [QNEthernet Library](https://github.com/ssilverman/QNEthernet) — native Ethernet for Teensy 4.1.
- [WS2815 Datasheet](https://www.led-stuebchen.de/download/WS2815-V1.1.pdf) — timing requirements.
- [PlatformIO Teensy Platform](https://docs.platformio.org/en/latest/platforms/teensy.html) — build system docs.  



## 11. Future Backlog

- OTA via Ethernet (Teensy supports this with some effort).
- Config-over-UDP (dynamic reconfig).
- Discovery/broadcast heartbeats for multi-sender setups.
- Optional CRC32 or HMAC in run packets.
- Support for APA102/SK9822 (SPI-based LEDs) as alternative to WS2815.
- TeensyThreads integration if more complex task scheduling needed.
