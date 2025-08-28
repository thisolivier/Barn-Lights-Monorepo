# WT32-ETH01 Controller Firmware — Project Spec v1
This document defines the firmware we’ll run on WT32-ETH01 (ESP32 + LAN8720 RMII) to receive per-run UDP frames, drive WS2815 strips, and emit active heartbeats so the sender can track liveness/errors with minimal overhead. It also covers how we’ll generate config from your existing JSON layouts at build time (no runtime FS).
## 0. Scope & Goals
### In-scope (v1)
Static IP Ethernet bring-up (RMII, LAN8720).
UDP receiver on PORT_BASE + run_index for run 0..N (N ≤ 3).
Frame assembly by frame_id; apply only last complete frame; otherwise hold last.
WS281x (WS2815) output via RMT (RGB→GRB conversion).
Active heartbeat: compact JSON once per second (plus event pings on notable errors), unicast to the sender.
Power-up behavior: hold black for ≥ 1s or until first frame, whichever is later.
Build-time codegen from layout JSON to set RUN_COUNT and per-run LED_COUNT[].
CLI + tools for build/flash/monitor (ESP-IDF), plus a tiny Python codegen script.
### Out-of-scope (v1)
OTA/flash via Ethernet (can be v2).
Runtime configuration changes (no dynamic reconfig).
HTTP, mDNS discovery, NTP (not needed on air-gapped LAN).
## 1. Hardware targets & safe GPIOs
To avoid RMII bus conflicts and boot-strap pitfalls, we will not use GPIOs tied to Ethernet or critical boot modes. On WT32-ETH01, RMII typically occupies GPIO0, 16, 17, 19, 21, 22, 25, 26, 27; GPIO0 is the RMII REFCLK input on many LAN8720 designs, so avoid it. 
letscontrolit.com
wesp32.com
Default LED data pins (safe choices):
RUN0: GPIO18
RUN1: GPIO23
RUN2: GPIO13
Rationale: these are not used by RMII on typical WT32-ETH01 configs and are not hazardous boot-straps. If your specific board variant differs, pins are compile-time configurable.
We will not use 0/1/2 by default (0 = RMII clock/strap; 1 = UART0 TX; 2 = boot strap). If you later confirm alternates, we tweak a single header.
## 2. Packet & heartbeat protocols (recap)
UDP run packet (sender → controller)
Dst IP: controller’s static IP (per side), e.g., 10.10.0.2.
Dst Port: PORT_BASE + run_index (e.g., 49600, 49601, 49602).
Payload:
u32 BE frame_id
followed by run_led_count * 3 bytes RGB (firmware converts to GRB).
Apply rule: Only display when all runs for the same frame_id have arrived. Otherwise hold last complete frame.
Heartbeat & events (controller → sender)
Mode: active unicast to SENDER_IP:STATUS_PORT (config vars).
Cadence: 1 Hz heartbeat + immediate event pings on significant errors.
Heartbeat JSON (≤256B):
```
{
  "id":"LEFT","ip":"10.10.0.2","fw":"0.1.0",
  "uptime_ms":123456,"link":true,
  "runs":3,"leds":[400,400,400],
  "rx_frames":2345,"complete":2301,"applied":2299,
  "last_id":2299,"last_mask":7,
  "drops":{"len":2,"stale":5}
}
```
Event examples (single short JSON datagrams):
```
{"event":"first_frame_applied","id":1189}
{"event":"drop_len","frame":1193,"run":1}
{"event":"stale_frame","frame":1194}
```
Sender will have a tiny UDP listener to fold these into its terminal telemetry.
## 3. Build-time config (use the same JSON)
We will consume your existing side layout JSON (e.g., left.json, right.json) at build time and generate a header with the constants the firmware needs:
SIDE_ID ("LEFT"/"RIGHT")
RUN_COUNT
LED_COUNT[RUN_COUNT] (sum of sections per run)
EXPECTED_MASK (bitmask of runs present)
(Optional) PORT_BASE, STATUS_PORT, STATIC_IP, NETMASK, GATEWAY, SENDER_IP
Flow
Place left.json or right.json in firmware/assets/side_layout.json.
Run python3 tools/gen_config.py --layout assets/side_layout.json --device assets/device.json --out build/generated/config_autogen.h.
config_autogen.h exposes RUN_COUNT, LED_COUNT[], etc., consumed by the firmware.
assets/device.json (small device-only settings):
```
{
  "side_id": "LEFT",
  "static_ip": "10.10.0.2",
  "netmask"  : "255.255.255.0",
  "gateway"  : "10.10.0.1",
  "port_base": 49600,
  "status_port": 49700,
  "sender_ip": "10.10.0.1",
  "gpio_data": [18, 23, 13]   // per-run
}
```
In v1 we compile these in; in v2 we can add OTA or runtime config if needed.
## 4. Firmware architecture (ESP-IDF 5.x)
### Components / tasks
* net_task
  * Init RMII Ethernet (LAN8720): MAC/PHY config, static IP set, bring-up.
  * Signal NET_READY on link/IP.
  * (Ref: ESP-IDF Ethernet guide). 
* rx_task
  * Single UDP socket (or 1 per side) with recvfrom(); deduce run_index by destination port.
  * Validate packet length = 4 + LED_COUNT[run]*3.
  * Stage into assembler slots keyed by frame_id:
  * Keep at most 2 frame_ids (current/next).
  * Track runs_mask for each slot.
  * On full mask match (runs_mask == EXPECTED_MASK), enqueue complete frame to driver; prune older slot.
* driver_task
  * On complete frame: swap back buffer and push out via RMT.
  * Power-up rule: ensure ≥ 1s black OR until first complete frame, whichever is later.
  * Uses RMT (1 channel per run if available) for WS281x timings; serialize if channels are constrained.
  * Convert RGB→GRB during buffer prep.
* status_task
  * Every 1000 ms: send heartbeat JSON to SENDER_IP:STATUS_PORT.
  * On notable events: send short event JSON (rate-limited).
* led_status helper
  * Blink onboard/aux LED slow while waiting for first frame
  * Brief tick each 60th frame arrives for the first 600 frames.
### Key data structures
```
typedef struct {
  uint32_t frame_id;
  uint8_t  runs_mask;                  // bit i set when run i received
  // Pointers to per-run staging buffers:
  uint8_t* run_buf[RUN_COUNT];         // size LED_COUNT[i]*3 each
} frame_slot_t;
```
```
typedef struct {
  // Immutable from config_autogen.h
  uint8_t  run_count;
  uint16_t led_count[RUN_COUNT];
  uint8_t  expected_mask;              // (1<<run_count)-1

  // Stats
  uint32_t rx_frames, complete_frames, applied_frames;
  uint32_t drops_len, drops_stale;
  uint32_t last_frame_id;
  uint8_t  last_mask;
} ctrl_state_t;
```
## 5. Timing & buffering
WS2815 @800 kHz: ~30 µs/LED incl. reset → ~12–15 ms per 400–500 LED run.
With 3 runs, serialize = ~36–45 ms worst case (still OK for 60 FPS soft-sync if updates overlap with receive). If needed, use parallel RMT channels to reduce visible skew.
Assembly keeps only two in-flight frame_ids to cap memory and ensure “latest wins”.
## 6. Error handling & aging policy
Length mismatch or unexpected size → drop packet; increment drops_len.
Older frame_id than last_frame_id (mod 2³²) → ignore; drops_stale++.
If a newer frame completes first, apply it and discard the older incomplete slot.
No packets: keep the last complete frame (after initial blackout).
Event pings are sent on: first frame applied, length mismatch, stale frame, Ethernet link state change.
## 7. Build, flash, and tooling (host)
Required:
ESP-IDF 5.2+ (installs idf.py, esptool.py)
Python 3.11+ for codegen
USB-serial cable for first flash
Suggested repo layout
```
firmware/
  assets/
    side_layout.json        # copy of left.json or right.json
    device.json             # IPs, ports, GPIOs, side_id, sender_ip
  tools/
    gen_config.py           # reads assets/*.json -> build/generated/config_autogen.h
  main/
    app_main.c
    net.c
    rx.c
    driver_ws281x.c
    status.c
    config_static.h         # small defaults; includes generated header
  build/generated/          # config_autogen.h (gitignored)
  CMakeLists.txt
  sdkconfig.defaults
```

## Build flow
### 1) Generate config header from JSONs
python3 tools/gen_config.py \
  --layout assets/side_layout.json \
  --device assets/device.json \
  --out build/generated/config_autogen.h

### 2) Build & flash & monitor
idf.py set-target esp32
idf.py build
idf.py -p /dev/tty.usbserial-XXXX flash
idf.py monitor
(If you prefer PlatformIO, we can wrap the same steps; ESP-IDF keeps things closest to Espressif docs.)
### 8) Test plan (device)
Boot & blackout: verify 1s black (or until first frame, whichever later), status LED blinks.
Ethernet up: static IP reachable; link LED on switch.
Packet smoke: send a single run packet (valid length) — strip updates only after all runs for that frame arrive.
Full sender: run laptop sender @60 FPS; confirm smooth updates, no flicker.
Loss injection: drop one run randomly; controller keeps last complete frame.
Heartbeat: sender’s status listener shows 1 Hz updates; event pings on first apply and on induced errors.
Throughput margin: observe counters (rx_frames, complete, applied) tracking expected rates.
### 9) Configuration matrix (per-device)
Setting	Source	Example
SIDE_ID	assets/device.json	"LEFT"
STATIC_IP	assets/device.json	"10.10.0.2"
PORT_BASE	assets/device.json	49600
STATUS_PORT	assets/device.json	49700
SENDER_IP	assets/device.json	"10.10.0.1"
RUN_COUNT	generated	3
LED_COUNT[]	generated	[400,400,400]
GPIO_DATA[]	assets/device.json	[18,23,13]
### 10) Notes & references
WT32-ETH01 typically routes RMII clock to GPIO0 and uses other EMAC pins; avoid these for LEDs. 
letscontrolit.com
wesp32.com
ESP-IDF Ethernet (EMAC + LAN8720) reference implementation and APIs: link layer bring-up & lwIP integration. 
Espressif Documentation
+1
### 11) v2 backlog
OTA via Ethernet (HTTP/TFTP or ESP-IDF OTA).
Config-over-UDP (change IPs/ports/LED counts without reflashing).
Parallel RMT for simultaneous multi-run output.
Optional broadcast heartbeats if you add multiple senders.
CRC32 or short HMAC in run packets (integrity/auth).