# Barn Lights UDP Sender

A simple command line tool for sending UDP packets to barn lights controllers. The CLI
loads configuration and layout files, spawns a renderer, assembles frames, and sends
them over UDP until a shutdown signal is received.

## Usage

Run the executable script with Node:

```bash
node bin/lights-sender.mjs [--config <path>] [--log-level <level>]
```

If you install the package globally or invoke it with `npx`, you can run `lights-sender` directly.

Options:

- `--config <path>` Path to `sender.config.json`. Defaults to `./config/sender.config.json`.
- `--log-level <level>` One of `error`, `warn`, `info`, or `debug`. Overrides the log level from the config file.

The process continues running until it receives `SIGINT` or `SIGTERM`, at which point
the renderer and UDP sender shut down cleanly.

### Demo Renderer

For development and testing a demo renderer is provided that continuously emits
NDJSON frames. Run the sender with the demo configuration:

```bash
npm start -- --config ./config/demo.config.json
```

Telemetry appears in the terminal:

```
side ingested built sent drop_build drop_overwrite  pps      Bps last_frame                last_send
left       25    25   25          0              0 75.0  90300.0         24 2025-08-27T16:52:19.867Z
right      25    25   25          0              0 75.0 112800.0         24 2025-08-27T16:52:19.867Z
```

Use `Ctrl+C` to stop the sender and demo renderer.

## UDP Data Format

Each frame is broken into runs and transmitted to the controllers as UDP datagrams.
For a given side the layout file defines both the destination IP (`static_ip`) and
the UDP base port (`port_base`). `sender.config.json` only lists paths to these layout
files, and each run is sent to `portBase + run_index`.

The UDP payload layout is:

```
Offset  Size  Description
0       4     frame_id (unsigned 32-bit big-endian)
4       N     RGB data for the run (run_led_count * 3 bytes)
```

- RGB bytes are in physical LED order with one 8-bit value for each of red, green
  and blue.
- The `frame_id` matches the `frame` value emitted by the renderer and wraps at
  2^32.
- Controllers should only display a frame after receiving all runs for a side with
  the same `frame_id`; otherwise the last complete frame should remain visible.

## Exit Codes

- `0` Normal shutdown.
- `1` Configuration or validation failure.
- `2` Renderer failed to start.

## Development

All source files use ES modules and carry the `.mjs` extension. The entry point is in `src/cli.mjs`. The executable script is `bin/lights-sender.mjs` which invokes `main()` from the CLI module and starts the renderer via `RendererProcess`.

