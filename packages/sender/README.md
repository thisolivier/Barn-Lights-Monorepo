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

## Exit Codes

- `0` Normal shutdown.
- `1` Configuration or validation failure.
- `2` Renderer failed to start.

## Development

All source files use ES modules and carry the `.mjs` extension. The entry point is in `src/cli.mjs`. The executable script is `bin/lights-sender.mjs` which invokes `main()` from the CLI module and starts the renderer via `RendererProcess`.

