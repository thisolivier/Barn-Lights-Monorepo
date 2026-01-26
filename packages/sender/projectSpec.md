# LED Sender / Transport — Project Spec v1
This spec defines the sender/transport program that consumes your existing renderer (NDJSON over stdout) and streams per-run UDP packets to LED controllers. It is platform-agnostic (Node.js LTS), terminal-first (no Electron, no HTTP UI in v1), and designed for clean separation of repos.

## 0. Scope & Goals
In-scope (v1):
* Spawn the renderer process.
* Read one NDJSON line per frame from stdout.
* Assemble per-run RGB buffers using the per-side layout configs.
* Transmit one UDP datagram per run with [frame_id(u32BE)] + [RGB bytes].
* Drop frames when behind; always send latest complete frame per side.
* Terminal telemetry (periodic counters & errors).
* Black-box test harness.
Out-of-scope (v1):
* MCU firmware and hardware discovery.
* HTTP status server (move to v2).
* Visual preview (your renderer already handles this).
* OTA, reliability telemetry backchannels.

## 1. Execution Model
* Single Node.js process, invoked via CLI: lights-sender --config ./config/sender.config.json
* On start:
    1. Load config & validate.
    2. Open UDP sockets (one per side with ports specifying runs).
    3. Spawn renderer (path & args from config).
    4. Begin NDJSON ingest → assembly → mailbox(per side) → send loop(per side).
* On shutdown (SIGINT/SIGTERM):
    * Stop sender loops.
    * Kill renderer child process with graceful timeout, then hard kill if needed.
    * Close sockets; flush final telemetry line.

## 2. External Contracts
2.1 Renderer → Sender (NDJSON over stdout)
One line per rendered frame:
``` 
{
  "ts": 1714000000,
  "frame": 0,
  "fps": 60,
  "format": "rgb8",
  "sides": {
    "left": {
      "row_A1": { "length": 180, "rgb_b64": "..." },
      "row_A2": { "length": 120, "rgb_b64": "..." }
    },
    "right": {
      "row_A1": { "length": 200, "rgb_b64": "..." }
    }
  }
}
``` 
* format must be "rgb8".
* frame is reused as wire frame_id (u32, wraps mod 2³²).
Acceptance rules:
* Extra sections present in NDJSON but not in layout → warn once per section name (then rate-limit) and ignore.
* Any required section (per layout) missing or with length mismatch → drop the entire frame for that side (do not partially send).
2.2 Sender → MCU (per-run UDP)
* Destination IPs: static per side.
* Ports: portBase + run_index.
* Datagram payload:
    * Bytes 0..3: frame_id (u32 big-endian).
    * Bytes 4..N: RGB bytes for the run (run_led_count * 3), in physical LED order (derived from layout section order & lengths).
MCU display rule (FYI):
* Apply a frame only when all runs for a side arrive with the same frame_id. Otherwise keep showing last complete frame.

## 3. Configuration (files & schema)
All config lives under ./config/.
3.1 sender.config.json
``` 
{
  "sides": {
    "left":  { "ip": "10.10.0.2", "portBase": 49600, "layout": "./config/left.json" },
    "right": { "ip": "10.10.0.3", "portBase": 49610, "layout": "./config/right.json" }
  },
  "renderer": {
    "cmd": "./bin/renderer",
    "args": ["--fps","60"],
    "cwd": "."  // optional
  },
  "telemetry": {
    "interval_ms": 1000,      // periodic terminal summary
    "log_level": "info"       // "error" | "warn" | "info" | "debug"
  }
}
``` 
* Editable IPs: You asked for a clear file—this is it. Update ip and portBase here.
* Layout JSON files are your side configs (examples you provided). The sender validates only fields it needs.
3.2 Side layout files (your format)
Use your current left.json / right.json. The sender relies on:
* side: "left" | "right"
* runs[]: objects with:
    * run_index: number
    * led_count: number (total for run)
    * sections[]: array of { id: string, led_count: number }
* All other fields (y, x0, x1, sampling) are ignored by the sender.
Validation invariants:
* For each run: sum(sections[].led_count) == run.led_count.
* run_index values must be unique within a side.
* side.total_leds == sum(runs[].led_count) (warn if mismatch; proceed).

## 4. Program Modules
4.1 config/
* Loader & validator for sender.config.json and side layout files.
* Produces a RuntimeConfig object:
``` 
type SectionCfg = { id: string; led_count: number; }
type RunCfg = { run_index: number; led_count: number; sections: SectionCfg[]; }
type SideCfg = { ip: string; portBase: number; runs: RunCfg[]; total_leds: number; side: "left"|"right" }

type RuntimeConfig = {
  sides: Record<"left"|"right", SideCfg | undefined>;
  renderer: { cmd: string; args: string[]; cwd?: string };
  telemetry: { interval_ms: number; log_level: LogLevel };
}
``` 
4.2 renderer-process/
* Spawns the renderer via child_process.spawn.
* Streams stdout through a line reader; parses NDJSON.
* Emits FrameIngest events to the assembler:
``` 
type NDJSONFrame = {
  ts: number; frame: number; fps: number; format: "rgb8";
  sides: Record<string, Record<string, { length: number; rgb_b64: string }>>;
}
``` 
4.3 assembler/
* For each configured side:
    * Build exactly one run-buffer per configured run for a given NDJSON frame.
    * Flow:
        1. Allocate or reuse a Uint8Array(run.led_count * 3) per run.
        2. For each section in the run:
            * Lookup ndjson.sides[sideName][section.id] → warn & fail side if missing.
            * atob(rgb_b64) (base64 decode) → verify length equals section.led_count * 3, else fail side.
            * buffer.set(decoded, offsetBytes), offsetBytes += section.led_count * 3.
        3. On success for all runs in side → produce AssembledFrame:
``` 
type AssembledFrame = {
  side: "left" | "right";
  frame_id: number;            // NDJSON frame modulo 2^32
  runs: { run_index: number; data: Uint8Array }[];
}
``` 
        4. Write the AssembledFrame into the side’s mailbox (overwriting any previous).
* Error policy: If any section fails for a side, drop that side’s frame (other side may still succeed).
4.4 mailbox/
* For each side, a single-slot atomic container { frame_id, runs[] }.
* Writer (assembler) overwrites the slot.
* Reader (sender) swaps & clears when it sends.
4.5 udp-sender/
* For each configured side, one async loop:
    * Poll the mailbox; if a frame present, send one packet per run to ip: (portBase + run_index).
    * Packet format: 4-byte big-endian frame_id followed by data bytes.
    * Update metrics: frames_sent, per-run packets_sent, bytes_sent.
* Node API: dgram.createSocket('udp4'). We’ll use a single socket per side for simplicity and specify port in send().
4.6 telemetry/
* Counters (per side):
    * frames_ingested (NDJSON lines parsed that targeted this side)
    * frames_built (assembled successfully)
    * frames_sent
    * frames_dropped_build (validation failures)
    * frames_dropped_overwrite (mailbox replaced before send loop consumed the prior one)
    * pps (packets/s last interval)
    * bytes_per_sec (last interval)
    * last_frame_id
    * last_send_ts
* Per run: packets_sent, bytes_sent, last_len, last_frame_id.
* Terminal output: once per interval_ms, print a succinct table + any rate-limited warnings. Human-readable tables only. Ensure messages accumulate are persisted for 3s.
4.7 logging/
* Log levels: error, warn, info, debug (configurable).
* Warnings to emit (rate-limited):
    * Extra NDJSON section keys not in layout.
    * Layout sums mismatch (on startup).
* Errors to emit:
    * NDJSON parse error (line skipped).
    * Missing section / length mismatch (frame dropped).
    * UDP send error (EHOSTUNREACH, etc.).

## 5. CLI & Usage
Usage: lights-sender --config <path>

Options:
  --config <path>            Path to sender.config.json (default: ./config/sender.config.json)
  --log-level <level>        error|warn|info|debug (default: from config)
Exit codes:
* 0 normal shutdown; 1 config/validation failure; 2 renderer failed to start.

## 6. Performance & Backpressure
* Expected traffic per controller at 60 FPS:
    * ≈ 3 packets × ~1200 bytes per frame ⇒ ~216 kB/s payload (plus headers) per side.
* Copy minimization: reuse buffers; base64 decode into pooled buffers.
* Backpressure policy (hard rule): the renderer is never blocked; sender drops by overwriting mailbox, ensuring the latest frame always wins.
* Throughput target: ≥ 1000 packets/s aggregate on modest hardware (well above our needs).

## 7. Error Handling
* Malformed NDJSON: log error, skip line.
* format != 'rgb8': error once then skip until it returns to rgb8.
* Section missing/mismatch: error & frames_dropped_build++ (side only).
* UDP send error: error; continue (do not retry v1).
* Renderer exit: log and exit the sender process with non-zero status.


## 8. Deliverables & Milestones
1. Skeleton CLI + config loader + logging.
2. Renderer spawn + NDJSON ingest (line reader).
3. Layout validation + assembler + mailbox.
4. UDP sender (per side loop) + packet format.
5. Telemetry (terminal).
6. Black-box test harness (fixture renderer + UDP probe of packet contents).
7. Docs: README with usage, config, invariants, and troubleshooting.