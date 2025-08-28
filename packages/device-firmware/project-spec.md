# WT32-ETH01 Controller Firmware — Project Spec v1.1

This document defines the firmware for the WT32-ETH01 (ESP32 + LAN8720 RMII). It receives per-run UDP frames, drives WS2815 strips, and emits active heartbeats so the sender can track liveness/errors. Configuration is generated at build time from the JSON layouts; no runtime filesystem is used.



## 0. Scope & Goals

### In-scope (v1.1)
- Static IP Ethernet bring-up (RMII, LAN8720).
- UDP receiver on `PORT_BASE + run_index` for run 0..N (N ≤ 3).
- Frame assembly by `frame_id`; apply only last complete frame; otherwise hold last applied frame.
- WS281x (WS2815) output via RMT:
  - **Runs driven in parallel** (each on its own RMT channel) to achieve ≥30 FPS.
  - RGB→GRB conversion during buffer prep.
- Active heartbeat: compact JSON once per second (plus event pings on notable errors), unicast to the sender.
- Power-up behavior: hold black for ≥1 s or until first frame, whichever is later.
- Build-time codegen from layout JSON to set `RUN_COUNT` and `LED_COUNT[]`.
- CLI + tools for build/flash/monitor (ESP-IDF), plus a tiny Python codegen script.

### Out-of-scope (v1.1)
- OTA/flash via Ethernet.
- Runtime configuration changes.
- HTTP, mDNS discovery, NTP.



## 1. Hardware Targets & GPIOs

To avoid RMII bus conflicts and boot-strap pitfalls:

- RMII pins: GPIO0, 16, 17, 19, 21, 22, 25, 26, 27. Avoid using these.
- Default LED data pins (safe choices):
  - RUN0: GPIO18  
  - RUN1: GPIO23  
  - RUN2: GPIO13  

GPIO0, 1, 2 are avoided (RMII clock/strap, UART0, boot strap). Alternate pins are compile-time configurable if needed.



## 2. Packet & Heartbeat Protocols

### UDP run packet (sender → controller)
- **Dst IP:** controller’s static IP (per side).  
- **Dst Port:** `PORT_BASE + run_index`.  
- **Payload:**  
  - `u32 BE frame_id`  
  - `run_led_count × 3` RGB bytes (firmware converts to GRB).  

**Apply rule:** only display when all runs for the same frame_id have arrived; otherwise hold last complete frame.

### Frame-ID ordering (wraparound)
- Frame IDs are 32-bit unsigned and compared **mod 2³²**.  
- Define “newer(a,b)” as `(int32_t)(a - b) > 0`.  
- A frame is considered stale if `!newer(frame_id, last_frame_id)`.  
- This handles wraparound seamlessly.

### Heartbeat & events (controller → sender)
- **Mode:** active unicast to `SENDER_IP:STATUS_PORT`.  
- **Cadence:** 1 Hz heartbeat + immediate event pings on significant errors.  

**Heartbeat JSON example (≤256B):**
```json
{
  "id": "LEFT",
  "ip": "10.10.0.2",
  "fw": "0.1.1",
  "uptime_ms": 123456,
  "link": true,
  "runs": 3,
  "leds": [400,400,400],
  "rx_frames": 2345,
  "complete": 2301,
  "applied": 2299,
  "last_id": 2299,
  "last_mask": 7,
  "drops": { "len": 2, "stale": 5 }
}
```
**Event examples:**
```
{"event":"first_frame_applied","id":1189}
{"event":"drop_len","frame":1193,"run":1}
{"event":"stale_frame","frame":1194}
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

### Components / Tasks
- **net_task**  
  - Init Ethernet (LAN8720), set static IP, signal `NET_READY`.

- **rx_task**  
  - UDP socket(s) → recvfrom().  
  - Deduce run_index from port.  
  - Validate length = `4 + LED_COUNT[i]*3`.  
  - Stage into assembler slots keyed by `frame_id`.  
  - Keep at most 2 frame_ids in flight (current/next).  
  - On full mask match, enqueue complete frame.

- **driver_task**  
  - On complete frame: swap back buffer and push to strips.  
  - **Parallel RMT**: one channel per run, triggered together for ≥30 FPS.  
  - Power-up: enforce ≥1 s black or until first complete frame.  
  - Convert RGB→GRB on prep.

- **status_task**  
  - Every 1000 ms: send heartbeat JSON.  
  - On notable events: send short event JSON (rate-limited).

- **led_status helper**  
  - Blink onboard LED slow until first frame.  
  - Tick every 60th frame for first 600 frames.



## 5. Timing & Buffering

- WS2815 @800 kHz: ~30 µs/LED including reset.  
- 400-LED run: ~12.3 ms.  
- 500-LED run: ~15.3 ms.  
- **Serialized (not acceptable):**
  - Left (3×400) → ~37 ms → ~27 FPS.  
  - Right (3×500) → ~46 ms → ~22 FPS.  
- **Parallel (chosen):**
  - All runs in parallel → bounded by longest run (~15.3 ms) → ≥60 FPS headroom.  



## 6. Error Handling & Recovery

- **Length mismatch:** drop packet; increment `drops_len`.  
- **Stale frame:** if not newer than `last_frame_id`, ignore; increment `drops_stale`.  
- **Out-of-order:** if a newer frame completes first, apply it and discard older incomplete.  
- **No packets:** keep last complete frame indefinitely.  
- **Link-down:** retain last applied frame, discard incomplete assembly slots. Resume fresh on link-up.



## 7. Build, Flash, Tooling

- Requires ESP-IDF 5.2+, Python 3.11+.  
- Tool: `gen_config.py` → `config_autogen.h`.  
- Build: `idf.py set-target esp32 && idf.py build`.  
- Flash/monitor via USB-serial for first load.  



## 8. Test Plan

- Boot → blackout for ≥1 s, LED blinks.  
- Ethernet up: static IP reachable.  
- Send a valid run packet: strip updates only when all runs for that frame arrive.  
- Full sender @30–60 FPS: confirm smooth updates.  
- Drop runs randomly: controller holds last complete frame.  
- Heartbeat visible at 1 Hz, event pings on induced errors.  
- Observe counters (`rx_frames`, `complete`, `applied`) match expected.



## 9. Configuration Matrix

| Setting       | Source             | Example       |
|---------------|-------------------|---------------|
| SIDE_ID       | device.json        | "LEFT"        |
| STATIC_IP     | device.json        | "10.10.0.2"   |
| PORT_BASE     | device.json        | 49600         |
| STATUS_PORT   | device.json        | 49700         |
| SENDER_IP     | device.json        | "10.10.0.1"   |
| RUN_COUNT     | generated          | 3             |
| LED_COUNT[]   | generated          | [400,400,400] |
| GPIO_DATA[]   | device.json        | [18,23,13]    |



## 10. References

- WT32-ETH01 pinouts & RMII notes (letscontrolit.com, wesp32.com).  
- ESP-IDF Ethernet (EMAC + LAN8720) docs.  
- WS281x timing requirements.  



## 11. v2 Backlog

- OTA via Ethernet.  
- Config-over-UDP (dynamic reconfig).  
- Parallel RMT already implemented in v1; v2 could explore DMA enhancements.  
- Discovery/broadcast heartbeats for multi-sender setups.  
- Optional CRC32 or HMAC in run packets.
