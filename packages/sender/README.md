# Barn Lights UDP Sender

A simple command line tool for sending UDP packets to barn lights controllers. This project is a skeleton and currently provides a CLI for loading configuration and initializing logging.

## Usage

```bash
lights-sender [--config <path>] [--log-level <level>]
```

Options:

- `--config <path>` Path to `sender.config.json`. Defaults to `./config/sender.config.json`.
- `--log-level <level>` One of `error`, `warn`, `info`, or `debug`. Overrides the log level from the config file.

## Exit Codes

- `0` Normal shutdown.
- `1` Configuration or validation failure.
- `2` Renderer failed to start.

## Development

The entry point is in `src/cli.ts`. The executable script is `bin/lights-sender` which invokes `main()` from the CLI module.
